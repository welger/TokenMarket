import { jest } from '@jest/globals';

import { OrdersService } from './orders.service.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import {
  FulfillmentType,
  OrderStatus,
  PaymentDriver,
  PlanActivationMode,
  PlanStatus,
  UserPlanStatus,
} from '../generated/prisma/client.js';
import type { TestPaymentDriver } from './test-payment.driver.js';

function createHarness() {
  const now = new Date('2026-06-12T00:00:00.000Z');
  const plan = {
    id: 'plan_1',
    name: '开发测试套餐',
    priceMinor: 100,
    currency: 'CNY',
    inputQuota: 1000n,
    outputQuota: 2000n,
    unifiedQuota: null,
    activationMode: PlanActivationMode.IMMEDIATE,
    validityDays: 30,
    status: PlanStatus.ACTIVE,
  };
  const order = {
    id: 'order_1',
    orderNumber: 'ord_test',
    userId: 'user_1',
    planId: plan.id,
    amountMinor: plan.priceMinor,
    currency: plan.currency,
    status: OrderStatus.PENDING_PAYMENT,
    paymentDriver: PaymentDriver.TEST,
    paymentReference: null,
    plan,
  };
  const fulfilledOrder = {
    ...order,
    status: OrderStatus.FULFILLED,
    paymentReference: 'test:order_1',
  };
  const userPlan = {
    id: 'user_plan_1',
    userId: 'user_1',
    planId: 'plan_1',
    orderId: 'order_1',
    fulfillmentType: FulfillmentType.PURCHASE,
    status: UserPlanStatus.ACTIVE,
  };
  const transaction = {
    order: {
      findUnique: jest.fn().mockResolvedValue(order),
      update: jest.fn().mockResolvedValue(fulfilledOrder),
    },
    userPlan: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(userPlan),
    },
    usageLedger: {
      create: jest.fn().mockResolvedValue({ id: 'ledger_1' }),
    },
  };
  const prisma = {
    plan: {
      findUnique: jest.fn().mockResolvedValue(plan),
    },
    order: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(order),
    },
    $transaction: jest.fn(
      async (
        operation: (client: typeof transaction) => Promise<unknown>,
      ) => operation(transaction),
    ),
  } as unknown as PrismaService;
  const paymentDriver = {
    pay: jest.fn().mockResolvedValue({
      driver: 'test',
      paymentReference: 'test:order_1',
      displayLabel: '测试支付',
    }),
  } as unknown as TestPaymentDriver;
  const service = new OrdersService(prisma, paymentDriver, () => now);

  return {
    service,
    prisma: prisma as unknown as {
      plan: { findUnique: jest.Mock };
      order: { findUnique: jest.Mock; create: jest.Mock };
    },
    transaction,
    paymentDriver,
    plan,
    order,
  };
}

describe('OrdersService', () => {
  it('creates an idempotent order using the server plan price', async () => {
    const harness = createHarness();

    await expect(
      harness.service.create('user_1', {
        planId: 'plan_1',
        idempotencyKey: 'idem_1',
      }),
    ).resolves.toMatchObject({
      amountMinor: 100,
      currency: 'CNY',
      paymentDriver: PaymentDriver.TEST,
    });
    expect(harness.prisma.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user_1',
        planId: 'plan_1',
        amountMinor: 100,
        currency: 'CNY',
        idempotencyKey: 'idem_1',
      }),
      include: { plan: true },
    });
  });

  it('returns the existing user order for the same idempotency key', async () => {
    const harness = createHarness();
    harness.prisma.order.findUnique.mockResolvedValue(harness.order);

    await expect(
      harness.service.create('user_1', {
        planId: 'plan_1',
        idempotencyKey: 'idem_1',
      }),
    ).resolves.toBe(harness.order);
    expect(harness.prisma.order.create).not.toHaveBeenCalled();
  });

  it('pays and fulfills an order in one transaction', async () => {
    const harness = createHarness();

    await expect(
      harness.service.payAndFulfill('user_1', 'order_1', {
        isAdmin: false,
      }),
    ).resolves.toMatchObject({
      order: { status: OrderStatus.FULFILLED },
      userPlan: { id: 'user_plan_1' },
      paymentLabel: '测试支付',
    });
    expect(harness.transaction.userPlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order_1',
        fulfillmentType: FulfillmentType.PURCHASE,
        status: UserPlanStatus.ACTIVE,
        initialInputQuota: 1000n,
        remainingInputQuota: 1000n,
        initialOutputQuota: 2000n,
        remainingOutputQuota: 2000n,
      }),
    });
    expect(harness.transaction.usageLedger.create).toHaveBeenCalled();
  });

  it('returns the existing fulfillment without paying twice', async () => {
    const harness = createHarness();
    harness.transaction.order.findUnique.mockResolvedValue({
      ...harness.order,
      status: OrderStatus.FULFILLED,
    });
    harness.transaction.userPlan.findUnique.mockResolvedValue({
      id: 'user_plan_1',
    });

    await harness.service.payAndFulfill('user_1', 'order_1', {
      isAdmin: false,
    });

    expect(harness.paymentDriver.pay).not.toHaveBeenCalled();
    expect(harness.transaction.userPlan.create).not.toHaveBeenCalled();
  });
});
