import {
  ConflictException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';

import { PrismaService } from '../common/prisma/prisma.service.js';
import {
  Prisma,
  UsageLedgerType,
  UserPlanStatus,
} from '../generated/prisma/client.js';
import { multiplyUnits } from './charge-calculator.js';
import { countUnicodeCodePoints } from './unicode-counter.js';

export const METERING_CLOCK = Symbol('METERING_CLOCK');

export class QuotaExhaustedException extends ConflictException {
  readonly code = 'QUOTA_EXHAUSTED';

  constructor() {
    super({
      code: 'QUOTA_EXHAUSTED',
      message: '套餐额度不足',
    });
  }
}

export interface MeteredCallMetadata {
  requestId: string;
  userId: string;
  apiKeyId: string;
  modelId: string;
  inputCharacters: number;
  inputChargedUnits: bigint;
  ipHash?: string;
}

export interface MeteredUpstreamResult<T> {
  value: T;
  outputCharacters: number;
  outputChargedUnits: bigint;
  upstreamRequestId?: string;
}

export interface MeteredStreamChunk {
  content: string;
  done: boolean;
}

export interface MeteredStreamOutcome {
  outputCharacters: number;
  outputChargedUnits: bigint;
  httpStatus: number;
  errorCode?: string;
}

export class StreamSettlementException extends Error {
  readonly code = 'STREAM_SETTLEMENT_FAILED';

  constructor(
    readonly settlement: {
      outputCharacters: number;
      outputChargedUnits: bigint;
    },
    cause: unknown,
  ) {
    super('Stream settlement failed', { cause });
  }
}

export interface FailedCallMetadata {
  requestId: string;
  userId: string;
  apiKeyId: string;
  modelId: string;
  inputCharacters: number;
  httpStatus: number;
  errorCode: string;
  durationMs: number;
  errorSummary?: string;
  ipHash?: string;
}

interface LockedPlanId {
  id: string;
}

@Injectable()
export class MeteringService {
  private readonly now: () => Date;

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(METERING_CLOCK)
    clock?: () => Date,
  ) {
    this.now = clock ?? (() => new Date());
  }

  runMetered<T>(
    metadata: MeteredCallMetadata,
    invokeUpstream: () => Promise<MeteredUpstreamResult<T>>,
  ): Promise<T> {
    const startedAt = this.now();
    return this.prisma.$transaction(
      async (transaction) => {
        const lockedIds = await transaction.$queryRaw<LockedPlanId[]>`
          SELECT up."id"
          FROM "UserPlan" AS up
          INNER JOIN "Plan" AS p ON p."id" = up."planId"
          INNER JOIN "_ModelToPlan" AS mp
            ON mp."B" = up."planId"
            AND mp."A" = ${metadata.modelId}
          WHERE up."userId" = ${metadata.userId}
            AND (
              up."status" = 'ACTIVE'
              OR (
                up."status" = 'PENDING'
                AND p."activationMode" = 'ON_FIRST_USE'
              )
            )
            AND (
              up."expiresAt" IS NULL
              OR up."expiresAt" > ${startedAt}
            )
          ORDER BY
            up."expiresAt" ASC NULLS LAST,
            COALESCE(up."activatedAt", up."createdAt") ASC,
            up."createdAt" ASC,
            up."id" ASC
          FOR UPDATE OF up
        `;
        const selected = await this.selectPlan(
          transaction,
          lockedIds,
          metadata.inputChargedUnits,
        );
        if (!selected) {
          throw new QuotaExhaustedException();
        }

        const upstream = await invokeUpstream();
        const balances = this.consumeBalances(
          selected,
          metadata.inputChargedUnits,
          upstream.outputChargedUnits,
        );
        const chargedUnits =
          metadata.inputChargedUnits + upstream.outputChargedUnits;
        const completedAt = this.now();
        const activating =
          selected.status === UserPlanStatus.PENDING;
        const status = this.statusAfterCharge(balances);
        const activatedAt = activating ? completedAt : selected.activatedAt;
        const expiresAt = activating
          ? this.addDays(completedAt, selected.plan.validityDays)
          : selected.expiresAt;

        await transaction.userPlan.update({
          where: { id: selected.id },
          data: {
            ...balances,
            status,
            ...(activating ? { activatedAt, expiresAt } : {}),
          },
        });
        const apiCall = await transaction.apiCall.create({
          data: {
            requestId: metadata.requestId,
            userId: metadata.userId,
            apiKeyId: metadata.apiKeyId,
            modelId: metadata.modelId,
            userPlanId: selected.id,
            inputCharacters: metadata.inputCharacters,
            outputCharacters: upstream.outputCharacters,
            inputChargedUnits: metadata.inputChargedUnits,
            outputChargedUnits: upstream.outputChargedUnits,
            chargedUnits,
            httpStatus: 200,
            durationMs: Math.max(
              0,
              completedAt.getTime() - startedAt.getTime(),
            ),
            upstreamRequestId: upstream.upstreamRequestId,
            ipHash: metadata.ipHash,
          },
        });
        await transaction.usageLedger.create({
          data: {
            userId: metadata.userId,
            userPlanId: selected.id,
            modelId: metadata.modelId,
            apiCallId: apiCall.id,
            type: UsageLedgerType.CONSUME,
            inputUnits: metadata.inputChargedUnits,
            outputUnits: upstream.outputChargedUnits,
            chargedUnits,
            remainingInput: balances.remainingInputQuota,
            remainingOutput: balances.remainingOutputQuota,
            remainingUnified: balances.remainingUnifiedQuota,
            description: '模型调用扣减',
          },
        });

        return upstream.value;
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 30_000,
      },
    );
  }

  async runStreamMetered(
    metadata: MeteredCallMetadata,
    outputMultiplier: string | number | { toString(): string },
    stream: AsyncIterable<MeteredStreamChunk>,
    emit: (content: string) => Promise<void> | void,
  ): Promise<MeteredStreamOutcome> {
    const startedAt = this.now();
    let emittedOutputCharacters = 0;
    let emittedOutputChargedUnits = 0n;
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
        const lockedIds = await transaction.$queryRaw<LockedPlanId[]>`
          SELECT up."id"
          FROM "UserPlan" AS up
          INNER JOIN "Plan" AS p ON p."id" = up."planId"
          INNER JOIN "_ModelToPlan" AS mp
            ON mp."B" = up."planId"
            AND mp."A" = ${metadata.modelId}
          WHERE up."userId" = ${metadata.userId}
            AND (
              up."status" = 'ACTIVE'
              OR (
                up."status" = 'PENDING'
                AND p."activationMode" = 'ON_FIRST_USE'
              )
            )
            AND (
              up."expiresAt" IS NULL
              OR up."expiresAt" > ${startedAt}
            )
          ORDER BY
            up."expiresAt" ASC NULLS LAST,
            COALESCE(up."activatedAt", up."createdAt") ASC,
            up."createdAt" ASC,
            up."id" ASC
          FOR UPDATE OF up
        `;
        const selected = await this.selectPlan(
          transaction,
          lockedIds,
          metadata.inputChargedUnits,
        );
        if (!selected) {
          throw new QuotaExhaustedException();
        }

        let outputCharacters = 0;
        let outputChargedUnits = 0n;
        let httpStatus = 200;
        let errorCode: string | undefined;
        let completed = false;
        try {
          for await (const chunk of stream) {
            if (chunk.content) {
              const nextCharacters =
                outputCharacters +
                countUnicodeCodePoints(chunk.content);
              const nextOutputCharge = multiplyUnits(
                nextCharacters,
                outputMultiplier,
              );
              this.consumeBalances(
                selected,
                metadata.inputChargedUnits,
                nextOutputCharge,
              );
              await emit(chunk.content);
              outputCharacters = nextCharacters;
              outputChargedUnits = nextOutputCharge;
              emittedOutputCharacters = outputCharacters;
              emittedOutputChargedUnits = outputChargedUnits;
            }
            if (chunk.done) {
              completed = true;
              break;
            }
          }
          if (!completed) {
            throw new Error('UPSTREAM_STREAM_INCOMPLETE');
          }
        } catch (error) {
          if (outputCharacters === 0) {
            throw error;
          }
          if (error instanceof QuotaExhaustedException) {
            httpStatus = 409;
            errorCode = 'QUOTA_EXHAUSTED';
          } else {
            httpStatus = 502;
            errorCode = 'UPSTREAM_TIMEOUT';
          }
        }

        const balances = this.consumeBalances(
          selected,
          metadata.inputChargedUnits,
          outputChargedUnits,
        );
        const chargedUnits =
          metadata.inputChargedUnits + outputChargedUnits;
        const completedAt = this.now();
        const activating =
          selected.status === UserPlanStatus.PENDING;
        const status = this.statusAfterCharge(balances);
        const activatedAt = activating
          ? completedAt
          : selected.activatedAt;
        const expiresAt = activating
          ? this.addDays(completedAt, selected.plan.validityDays)
          : selected.expiresAt;

        await transaction.userPlan.update({
          where: { id: selected.id },
          data: {
            ...balances,
            status,
            ...(activating ? { activatedAt, expiresAt } : {}),
          },
        });
        const apiCall = await transaction.apiCall.create({
          data: {
            requestId: metadata.requestId,
            userId: metadata.userId,
            apiKeyId: metadata.apiKeyId,
            modelId: metadata.modelId,
            userPlanId: selected.id,
            inputCharacters: metadata.inputCharacters,
            outputCharacters,
            inputChargedUnits: metadata.inputChargedUnits,
            outputChargedUnits,
            chargedUnits,
            httpStatus,
            errorCode,
            errorSummary: errorCode
              ? this.safeErrorSummary(errorCode)
              : undefined,
            durationMs: Math.max(
              0,
              completedAt.getTime() - startedAt.getTime(),
            ),
            ipHash: metadata.ipHash,
          },
        });
        await transaction.usageLedger.create({
          data: {
            userId: metadata.userId,
            userPlanId: selected.id,
            modelId: metadata.modelId,
            apiCallId: apiCall.id,
            type: UsageLedgerType.CONSUME,
            inputUnits: metadata.inputChargedUnits,
            outputUnits: outputChargedUnits,
            chargedUnits,
            remainingInput: balances.remainingInputQuota,
            remainingOutput: balances.remainingOutputQuota,
            remainingUnified: balances.remainingUnifiedQuota,
            description:
              httpStatus === 200
                ? '模型流式调用扣减'
                : '模型流式中断按已发送内容扣减',
          },
        });

        return {
          outputCharacters,
          outputChargedUnits,
          httpStatus,
          errorCode,
        };
        },
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.ReadCommitted,
          timeout: 120_000,
        },
      );
    } catch (error) {
      if (emittedOutputCharacters > 0) {
        throw new StreamSettlementException(
          {
            outputCharacters: emittedOutputCharacters,
            outputChargedUnits: emittedOutputChargedUnits,
          },
          error,
        );
      }
      throw error;
    }
  }

  recordFailure(metadata: FailedCallMetadata) {
    return this.prisma.apiCall.create({
      data: {
        requestId: metadata.requestId,
        userId: metadata.userId,
        apiKeyId: metadata.apiKeyId,
        modelId: metadata.modelId,
        userPlanId: null,
        inputCharacters: metadata.inputCharacters,
        outputCharacters: 0,
        inputChargedUnits: 0n,
        outputChargedUnits: 0n,
        chargedUnits: 0n,
        httpStatus: metadata.httpStatus,
        errorCode: metadata.errorCode,
        durationMs: metadata.durationMs,
        errorSummary: this.safeErrorSummary(metadata.errorCode),
        ipHash: metadata.ipHash,
      },
    });
  }

  private async selectPlan(
    transaction: Prisma.TransactionClient,
    lockedIds: LockedPlanId[],
    inputCharge: bigint,
  ) {
    for (const { id } of lockedIds) {
      const plan = await transaction.userPlan.findUnique({
        where: { id },
        include: {
          plan: {
            select: {
              validityDays: true,
            },
          },
        },
      });
      if (plan && this.canCoverInput(plan, inputCharge)) {
        return plan;
      }
    }
    return undefined;
  }

  private canCoverInput(
    plan: {
      remainingInputQuota: bigint | null;
      remainingUnifiedQuota: bigint | null;
    },
    charge: bigint,
  ): boolean {
    if (plan.remainingUnifiedQuota !== null) {
      return plan.remainingUnifiedQuota >= charge;
    }
    return (plan.remainingInputQuota ?? 0n) >= charge;
  }

  private consumeBalances(
    plan: {
      remainingInputQuota: bigint | null;
      remainingOutputQuota: bigint | null;
      remainingUnifiedQuota: bigint | null;
    },
    inputCharge: bigint,
    outputCharge: bigint,
  ) {
    if (plan.remainingUnifiedQuota !== null) {
      const charged = inputCharge + outputCharge;
      if (plan.remainingUnifiedQuota < charged) {
        throw new QuotaExhaustedException();
      }
      return {
        remainingInputQuota: null,
        remainingOutputQuota: null,
        remainingUnifiedQuota:
          plan.remainingUnifiedQuota - charged,
      };
    }

    const remainingInput = plan.remainingInputQuota ?? 0n;
    const remainingOutput = plan.remainingOutputQuota ?? 0n;
    if (
      remainingInput < inputCharge ||
      remainingOutput < outputCharge
    ) {
      throw new QuotaExhaustedException();
    }
    return {
      remainingInputQuota: remainingInput - inputCharge,
      remainingOutputQuota: remainingOutput - outputCharge,
      remainingUnifiedQuota: null,
    };
  }

  private statusAfterCharge(balances: {
    remainingInputQuota: bigint | null;
    remainingOutputQuota: bigint | null;
    remainingUnifiedQuota: bigint | null;
  }): UserPlanStatus {
    const exhausted =
      balances.remainingUnifiedQuota !== null
        ? balances.remainingUnifiedQuota === 0n
        : (balances.remainingInputQuota ?? 0n) === 0n &&
          (balances.remainingOutputQuota ?? 0n) === 0n;
    return exhausted
      ? UserPlanStatus.EXHAUSTED
      : UserPlanStatus.ACTIVE;
  }

  private addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private safeErrorSummary(errorCode: string): string {
    const summaries: Record<string, string> = {
      UPSTREAM_TIMEOUT: 'Upstream request failed',
      MODEL_UNAVAILABLE: 'Model is unavailable',
      CONTENT_REJECTED: 'Content safety policy rejected the request',
      RATE_LIMITED: 'Request rate limited',
      QUOTA_EXHAUSTED: 'Plan quota is exhausted',
    };
    return summaries[errorCode] ?? 'Request failed';
  }
}
