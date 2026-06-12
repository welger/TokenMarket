import { BadRequestException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PlansService } from './plans.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import {
  PlanActivationMode,
  PlanStatus,
} from '../generated/prisma/client.js';

function validPlanInput() {
  return {
    name: '开发测试套餐',
    description: '本地开发测试使用',
    priceMinor: 100,
    currency: 'CNY',
    inputQuota: 1000,
    outputQuota: 2000,
    activationMode: PlanActivationMode.IMMEDIATE,
    validityDays: 30,
    refundPolicy: '未使用可申请退款',
    purchaseNotice: '测试支付不产生真实扣款',
    status: PlanStatus.ACTIVE,
    modelIds: ['model_1'],
  };
}

function createHarness() {
  const created = {
    id: 'plan_1',
    ...validPlanInput(),
    inputQuota: 1000n,
    outputQuota: 2000n,
    unifiedQuota: null,
    models: [{ id: 'model_1' }],
  };
  const transaction = {
    plan: {
      create: jest.fn().mockResolvedValue(created),
      findUniqueOrThrow: jest.fn().mockResolvedValue(created),
      update: jest.fn().mockResolvedValue(created),
    },
    model: {
      count: jest.fn().mockResolvedValue(1),
    },
    complianceProfile: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    plan: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;
  const audit = {
    runInAuditedTransaction: jest.fn(
      async (
        _input: unknown,
        operation: (context: {
          transaction: typeof transaction;
          setBeforeSummary(value: unknown): void;
          setAfterSummary(value: unknown): void;
        }) => Promise<unknown>,
      ) =>
        operation({
          transaction,
          setBeforeSummary: () => undefined,
          setAfterSummary: () => undefined,
        }),
    ),
  } as unknown as AuditService;

  return {
    service: new PlansService(prisma, audit),
    transaction,
    audit,
  };
}

describe('PlansService', () => {
  it('creates a plan through an audited transaction', async () => {
    const harness = createHarness();

    await expect(
      harness.service.create('admin_1', validPlanInput()),
    ).resolves.toMatchObject({ id: 'plan_1' });
    expect(harness.audit.runInAuditedTransaction).toHaveBeenCalled();
    expect(harness.transaction.plan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        inputQuota: 1000n,
        outputQuota: 2000n,
        unifiedQuota: null,
        models: { connect: [{ id: 'model_1' }] },
      }),
      include: { models: true },
    });
  });

  it('rejects mixing unified and separate quotas', () => {
    const harness = createHarness();

    expect(() =>
      harness.service.create('admin_1', {
        ...validPlanInput(),
        unifiedQuota: 3000,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects plans without an applicable model', () => {
    const harness = createHarness();

    expect(() =>
      harness.service.create('admin_1', {
        ...validPlanInput(),
        modelIds: [],
      }),
    ).toThrow('Invalid modelIds');
  });

  it('allows an update to replace split quotas with a unified quota', async () => {
    const harness = createHarness();

    await harness.service.update('admin_1', 'plan_1', {
      inputQuota: null,
      outputQuota: null,
      unifiedQuota: 5000,
    });

    expect(harness.transaction.plan.update).toHaveBeenCalledWith({
      where: { id: 'plan_1' },
      data: expect.objectContaining({
        inputQuota: null,
        outputQuota: null,
        unifiedQuota: 5000n,
      }),
      include: { models: true },
    });
  });
});
