import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  createApiKeyMaterial,
  hashApiKey,
  parseApiKey,
  verifyApiKeyHash,
} from './api-key.crypto.js';
import type { EnvironmentVariables } from '../common/config/env.schema.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import {
  ApiKeyStatus,
  Prisma,
  UserStatus,
} from '../generated/prisma/client.js';

const MAX_ACTIVE_KEYS = 10;
const CACHE_TTL_MS = 60_000;
const SERIALIZATION_RETRIES = 3;

export interface ApiKeyIdentity {
  apiKeyId: string;
  userId: string;
}

interface CacheEntry {
  identity: ApiKeyIdentity;
  keyId: string;
  expiresAt: number;
}

@Injectable()
export class ApiKeyAuthCache {
  private readonly entries = new Map<string, CacheEntry>();

  get(secretHash: string): ApiKeyIdentity | undefined {
    const entry = this.entries.get(secretHash);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(secretHash);
      return undefined;
    }
    return entry.identity;
  }

  set(
    secretHash: string,
    keyId: string,
    identity: ApiKeyIdentity,
  ): void {
    this.entries.set(secretHash, {
      identity,
      keyId,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }

  invalidateKey(keyId: string): void {
    for (const [hash, entry] of this.entries) {
      if (entry.keyId === keyId) {
        this.entries.delete(hash);
      }
    }
  }
}

@Injectable()
export class ApiKeysService {
  private readonly pepper: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<EnvironmentVariables, true>,
    private readonly cache: ApiKeyAuthCache,
  ) {
    this.pepper = config.get('API_KEY_PEPPER', { infer: true });
  }

  async create(userId: string, nameInput: unknown) {
    const name = this.keyName(nameInput);
    const id = randomUUID();
    const material = createApiKeyMaterial(id, this.pepper);

    for (let attempt = 1; attempt <= SERIALIZATION_RETRIES; attempt += 1) {
      try {
        const created = await this.prisma.$transaction(
          async (transaction) => {
            const activeCount = await transaction.apiKey.count({
              where: {
                userId,
                status: ApiKeyStatus.ACTIVE,
              },
            });
            if (activeCount >= MAX_ACTIVE_KEYS) {
              throw new ConflictException(
                'Each user can have at most 10 active API keys',
              );
            }

            return transaction.apiKey.create({
              data: {
                id,
                userId,
                name,
                prefix: material.prefix,
                lastFour: material.lastFour,
                secretHash: material.secretHash,
              },
              select: {
                id: true,
                name: true,
                prefix: true,
                lastFour: true,
                status: true,
                createdAt: true,
                disabledAt: true,
              },
            });
          },
          {
            isolationLevel:
              Prisma.TransactionIsolationLevel.Serializable,
          },
        );

        return {
          ...this.present(created),
          plaintext: material.plaintext,
        };
      } catch (error) {
        if (
          attempt < SERIALIZATION_RETRIES &&
          this.isSerializationFailure(error)
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException('Could not create API key');
  }

  async list(userId: string) {
    const keys = await this.prisma.apiKey.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastFour: true,
        status: true,
        createdAt: true,
        disabledAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return keys.map((key) => this.present(key));
  }

  async disable(userId: string, keyId: string) {
    const existing = await this.prisma.apiKey.findFirst({
      where: { id: keyId, userId },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastFour: true,
        status: true,
        createdAt: true,
        disabledAt: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('API key not found');
    }
    if (existing.status === ApiKeyStatus.DISABLED) {
      this.cache.invalidateKey(keyId);
      return this.present(existing);
    }

    const disabledAt = new Date();
    const update = await this.prisma.apiKey.updateMany({
      where: {
        id: keyId,
        userId,
        status: ApiKeyStatus.ACTIVE,
      },
      data: {
        status: ApiKeyStatus.DISABLED,
        disabledAt,
      },
    });
    if (update.count !== 1) {
      throw new ConflictException('API key status changed concurrently');
    }
    this.cache.invalidateKey(keyId);
    return this.present({
      ...existing,
      status: ApiKeyStatus.DISABLED,
      disabledAt,
    });
  }

  async authenticate(plaintext: string): Promise<ApiKeyIdentity> {
    const parsed = parseApiKey(plaintext);
    if (!parsed) {
      throw new UnauthorizedException();
    }
    const candidateHash = hashApiKey(this.pepper, plaintext);
    const key = await this.prisma.apiKey.findUnique({
      where: { id: parsed.keyId },
      select: {
        id: true,
        userId: true,
        secretHash: true,
        status: true,
        user: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });
    if (
      !key ||
      key.status !== ApiKeyStatus.ACTIVE ||
      key.user.status !== UserStatus.ACTIVE
    ) {
      throw new UnauthorizedException();
    }

    const cached = this.cache.get(candidateHash);
    if (
      cached?.apiKeyId === key.id &&
      cached.userId === key.userId
    ) {
      return cached;
    }
    if (!verifyApiKeyHash(this.pepper, plaintext, key.secretHash)) {
      throw new UnauthorizedException();
    }

    const identity = {
      apiKeyId: key.id,
      userId: key.userId,
    };
    this.cache.set(candidateHash, key.id, identity);
    return identity;
  }

  private present(key: {
    id: string;
    name: string;
    prefix: string;
    lastFour: string;
    status: ApiKeyStatus;
    createdAt: Date;
    disabledAt: Date | null;
  }) {
    return {
      id: key.id,
      name: key.name,
      masked: `${key.prefix}_****${key.lastFour}`,
      status: key.status,
      createdAt: key.createdAt,
      ...(key.disabledAt ? { disabledAt: key.disabledAt } : {}),
    };
  }

  private keyName(value: unknown): string {
    if (
      typeof value !== 'string' ||
      value.trim().length === 0 ||
      value.trim().length > 100
    ) {
      throw new BadRequestException('Invalid API key name');
    }
    return value.trim();
  }

  private isSerializationFailure(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2034'
    );
  }
}
