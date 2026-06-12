import { ConflictException } from '@nestjs/common';
import { jest } from '@jest/globals';

import {
  MeteringService,
  StreamSettlementException,
} from './metering.service.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import {
  UsageLedgerType,
  UserPlanStatus,
} from '../generated/prisma/client.js';

function createHarness(
  planOverrides: Record<string, unknown> = {},
) {
  const now = new Date('2026-06-12T00:00:00.000Z');
  const userPlan = {
    id: 'user_plan_1',
    userId: 'user_1',
    planId: 'plan_1',
    status: UserPlanStatus.ACTIVE,
    remainingInputQuota: null,
    remainingOutputQuota: null,
    remainingUnifiedQuota: 100n,
    activatedAt: now,
    expiresAt: new Date('2026-07-12T00:00:00.000Z'),
    plan: {
      validityDays: 30,
    },
    ...planOverrides,
  };
  const transaction = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'user_plan_1' }]),
    userPlan: {
      findUnique: jest.fn().mockResolvedValue(userPlan),
      update: jest.fn().mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...userPlan, ...data }),
      ),
    },
    apiCall: {
      create: jest.fn().mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'call_1', ...data }),
      ),
    },
    usageLedger: {
      create: jest.fn().mockResolvedValue({ id: 'ledger_1' }),
    },
  };
  const prisma = {
    $transaction: jest.fn(
      async (
        operation: (client: typeof transaction) => Promise<unknown>,
      ) => operation(transaction),
    ),
    apiCall: {
      create: jest.fn().mockResolvedValue({ id: 'failed_call_1' }),
    },
  } as unknown as PrismaService;

  return {
    service: new MeteringService(prisma, () => now),
    prisma: prisma as unknown as {
      apiCall: { create: jest.Mock };
      $transaction: jest.Mock;
    },
    transaction,
  };
}

const callMetadata = {
  requestId: 'req_1',
  userId: 'user_1',
  apiKeyId: 'key_1',
  modelId: 'model_1',
  inputCharacters: 4,
  inputChargedUnits: 4n,
  ipHash: 'hash',
};

describe('MeteringService', () => {
  it('locks a plan, runs upstream, and commits a unified quota charge', async () => {
    const harness = createHarness();
    const upstream = jest.fn().mockResolvedValue({
      value: { content: '你好' },
      outputCharacters: 2,
      outputChargedUnits: 4n,
      upstreamRequestId: 'upstream_1',
    });

    await expect(
      harness.service.runMetered(callMetadata, upstream),
    ).resolves.toEqual({
      content: '你好',
    });
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(harness.transaction.userPlan.update).toHaveBeenCalledWith({
      where: { id: 'user_plan_1' },
      data: expect.objectContaining({
        remainingUnifiedQuota: 92n,
        status: UserPlanStatus.ACTIVE,
      }),
    });
    expect(harness.transaction.apiCall.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userPlanId: 'user_plan_1',
        outputCharacters: 2,
        outputChargedUnits: 4n,
        chargedUnits: 8n,
        httpStatus: 200,
        upstreamRequestId: 'upstream_1',
      }),
    });
    expect(harness.transaction.usageLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: UsageLedgerType.CONSUME,
        chargedUnits: 8n,
        remainingUnified: 92n,
      }),
    });
  });

  it('does not charge or write a success call when upstream fails', async () => {
    const harness = createHarness();
    const upstream = jest
      .fn<() => Promise<never>>()
      .mockRejectedValue(new Error('upstream failed'));

    await expect(
      harness.service.runMetered(callMetadata, upstream),
    ).rejects.toThrow('upstream failed');
    expect(harness.transaction.userPlan.update).not.toHaveBeenCalled();
    expect(harness.transaction.apiCall.create).not.toHaveBeenCalled();
    expect(harness.transaction.usageLedger.create).not.toHaveBeenCalled();
  });

  it('rejects a call before upstream when quota is insufficient', async () => {
    const harness = createHarness({
      remainingUnifiedQuota: 3n,
    });
    const upstream = jest.fn();

    await expect(
      harness.service.runMetered(callMetadata, upstream),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('charges separate input and output balances', async () => {
    const harness = createHarness({
      remainingInputQuota: 10n,
      remainingOutputQuota: 20n,
      remainingUnifiedQuota: null,
    });

    await harness.service.runMetered(
      callMetadata,
      async () => ({
        value: { content: 'ok' },
        outputCharacters: 2,
        outputChargedUnits: 3n,
      }),
    );

    expect(harness.transaction.userPlan.update).toHaveBeenCalledWith({
      where: { id: 'user_plan_1' },
      data: expect.objectContaining({
        remainingInputQuota: 6n,
        remainingOutputQuota: 17n,
        status: UserPlanStatus.ACTIVE,
      }),
    });
  });

  it('records a sanitized failed call without charging a plan', async () => {
    const harness = createHarness();

    await harness.service.recordFailure({
      requestId: 'req_failed',
      userId: 'user_1',
      apiKeyId: 'key_1',
      modelId: 'model_1',
      inputCharacters: 4,
      httpStatus: 502,
      errorCode: 'UPSTREAM_TIMEOUT',
      durationMs: 500,
      errorSummary: 'private prompt: do not store this',
      ipHash: 'hash',
    });

    expect(harness.prisma.apiCall.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        chargedUnits: 0n,
        userPlanId: null,
        errorSummary: 'Upstream request failed',
      }),
    });
  });

  it('preserves emitted usage when a stream transaction fails to commit', async () => {
    const harness = createHarness();
    harness.prisma.$transaction.mockImplementation(
      async (
        operation: (
          client: typeof harness.transaction,
        ) => Promise<unknown>,
      ) => {
        await operation(harness.transaction);
        throw new Error('commit failed');
      },
    );
    async function* stream() {
      yield { content: '你好', done: false };
      yield { content: '', done: true };
    }

    await expect(
      harness.service.runStreamMetered(
        callMetadata,
        2,
        stream(),
        () => undefined,
      ),
    ).rejects.toMatchObject<Partial<StreamSettlementException>>({
      code: 'STREAM_SETTLEMENT_FAILED',
      settlement: {
        outputCharacters: 2,
        outputChargedUnits: 4n,
      },
    });
  });

  it('charges emitted output and marks a stream that ends without done as failed', async () => {
    const harness = createHarness();
    async function* incompleteStream() {
      yield { content: '你好', done: false };
    }

    await expect(
      harness.service.runStreamMetered(
        callMetadata,
        2,
        incompleteStream(),
        () => undefined,
      ),
    ).resolves.toMatchObject({
      outputCharacters: 2,
      outputChargedUnits: 4n,
      httpStatus: 502,
      errorCode: 'UPSTREAM_TIMEOUT',
    });
    expect(harness.transaction.apiCall.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        httpStatus: 502,
        errorCode: 'UPSTREAM_TIMEOUT',
        chargedUnits: 8n,
      }),
    });
  });
});
