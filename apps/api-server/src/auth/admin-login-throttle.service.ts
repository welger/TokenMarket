import { createHmac, randomUUID } from 'node:crypto';

import {
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../common/config/env.schema.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

const FAILURE_LIMIT = 5;
const FAILURE_WINDOW_MS = 5 * 60 * 1000;
const ARGON2_LEASE_MS = 30 * 1000;

interface ThrottleState {
  failureCount: number;
  blockedUntil: Date | null;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
  expiresAt: Date;
}

export interface AdminLoginThrottleLease {
  recordFailure(): Promise<void>;
  clearFailures(): Promise<void>;
  release(): Promise<void>;
}

@Injectable()
export class AdminLoginThrottleService {
  private readonly hashSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService<EnvironmentVariables, true>,
  ) {
    this.hashSecret = configService.get('ADMIN_LOGIN_THROTTLE_SECRET', {
      infer: true,
    });
  }

  async beginAttempt(
    username: string,
    ip: string,
  ): Promise<AdminLoginThrottleLease> {
    const keyHashes = [
      this.hashScope('ip', ip),
      this.hashScope('username', username),
    ].sort();
    const leaseToken = randomUUID();
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + ARGON2_LEASE_MS);
    const expiresAt = new Date(now.getTime() + FAILURE_WINDOW_MS);

    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.$executeRaw`
          DELETE FROM "AdminLoginThrottle"
          WHERE "keyHash" IN (
            SELECT "keyHash"
            FROM "AdminLoginThrottle"
            WHERE "expiresAt" <= ${now}
              AND (
                "leaseExpiresAt" IS NULL
                OR "leaseExpiresAt" <= ${now}
              )
            ORDER BY "expiresAt"
            LIMIT 100
          )
          AND "expiresAt" <= ${now}
          AND (
            "leaseExpiresAt" IS NULL
            OR "leaseExpiresAt" <= ${now}
          )
        `;

        for (const keyHash of keyHashes) {
          await transaction.$executeRaw`
            INSERT INTO "AdminLoginThrottle" (
              "keyHash",
              "failureCount",
              "expiresAt",
              "updatedAt"
            )
            VALUES (${keyHash}, 0, ${expiresAt}, ${now})
            ON CONFLICT ("keyHash") DO NOTHING
          `;

          const state = await this.lockState(transaction, keyHash);
          if (!state) {
            throw new Error('Login throttle state was not created');
          }

          const windowExpired =
            state.expiresAt.getTime() <= now.getTime();
          const blocked =
            !windowExpired &&
            state.failureCount >= FAILURE_LIMIT &&
            state.blockedUntil !== null &&
            state.blockedUntil.getTime() > now.getTime();
          const leaseActive =
            state.leaseToken !== null &&
            state.leaseExpiresAt !== null &&
            state.leaseExpiresAt.getTime() > now.getTime();

          if (blocked || leaseActive) {
            throw new HttpException(
              'Too Many Requests',
              HttpStatus.TOO_MANY_REQUESTS,
            );
          }

          await transaction.adminLoginThrottle.update({
            where: { keyHash },
            data: {
              failureCount: windowExpired ? 0 : state.failureCount,
              blockedUntil: windowExpired ? null : state.blockedUntil,
              leaseToken,
              leaseExpiresAt,
              expiresAt: windowExpired ? expiresAt : state.expiresAt,
            },
          });
        }
      });

      return this.createLease(keyHashes, leaseToken);
    } catch (error) {
      if (
        error instanceof HttpException &&
        error.getStatus() === HttpStatus.TOO_MANY_REQUESTS
      ) {
        throw error;
      }
      throw new ServiceUnavailableException('Admin login unavailable');
    }
  }

  async clearIdentity(username: string, ip: string): Promise<void> {
    const keyHashes = [
      this.hashScope('ip', ip),
      this.hashScope('username', username),
    ];
    try {
      await this.prisma.adminLoginThrottle.deleteMany({
        where: { keyHash: { in: keyHashes } },
      });
    } catch {
      throw new ServiceUnavailableException('Admin login unavailable');
    }
  }

  private createLease(
    keyHashes: string[],
    leaseToken: string,
  ): AdminLoginThrottleLease {
    let finalized = false;

    const run = async (
      operation: (transaction: Prisma.TransactionClient) => Promise<void>,
    ): Promise<void> => {
      try {
        await this.prisma.$transaction(operation);
      } catch {
        throw new ServiceUnavailableException('Admin login unavailable');
      }
    };

    return {
      recordFailure: async () => {
        await run(async (transaction) => {
          const now = new Date();
          for (const keyHash of keyHashes) {
            const state = await this.lockState(transaction, keyHash);
            if (!state || state.leaseToken !== leaseToken) {
              continue;
            }

            const windowExpired =
              state.expiresAt.getTime() <= now.getTime();
            const failureCount = windowExpired
              ? 1
              : state.failureCount + 1;
            const expiresAt = new Date(now.getTime() + FAILURE_WINDOW_MS);

            await transaction.adminLoginThrottle.update({
              where: { keyHash },
              data: {
                failureCount,
                blockedUntil:
                  failureCount >= FAILURE_LIMIT ? expiresAt : null,
                leaseToken: null,
                leaseExpiresAt: null,
                expiresAt,
              },
            });
          }
        });
        finalized = true;
      },
      clearFailures: async () => {
        await run(async (transaction) => {
          await transaction.adminLoginThrottle.deleteMany({
            where: {
              keyHash: { in: keyHashes },
              leaseToken,
            },
          });
        });
        finalized = true;
      },
      release: async () => {
        if (finalized) {
          return;
        }
        await run(async (transaction) => {
          await transaction.adminLoginThrottle.updateMany({
            where: {
              keyHash: { in: keyHashes },
              leaseToken,
            },
            data: {
              leaseToken: null,
              leaseExpiresAt: null,
            },
          });
        });
        finalized = true;
      },
    };
  }

  private async lockState(
    transaction: Prisma.TransactionClient,
    keyHash: string,
  ): Promise<ThrottleState | undefined> {
    const [state] = await transaction.$queryRaw<ThrottleState[]>`
      SELECT
        "failureCount",
        "blockedUntil",
        "leaseToken",
        "leaseExpiresAt",
        "expiresAt"
      FROM "AdminLoginThrottle"
      WHERE "keyHash" = ${keyHash}
      FOR UPDATE
    `;
    return state;
  }

  private hashScope(scope: 'ip' | 'username', value: string): string {
    return createHmac('sha256', this.hashSecret)
      .update('admin-login-throttle:v1:')
      .update(scope)
      .update('\0')
      .update(value)
      .digest('hex');
  }
}
