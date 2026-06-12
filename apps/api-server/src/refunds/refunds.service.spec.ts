import { ConflictException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { RefundsService } from './refunds.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import {
  OrderStatus,
  PaymentDriver,
  RefundStatus,
  UserPlanStatus,
} from '../generated/prisma/client.js';

function createHarness(
  orderOverrides: Record<string, unknown> = {},
) {
  const order = {
    id: 'order_1',
    userId: 'user_1',
    amountMinor: 100,
    currency: 'CNY',
    status: OrderStatus.FULFILLED,
    paymentDriver: PaymentDriver.TEST,
    ...orderOverrides,
  };
  const createdRefund = {
    id: 'refund_1',
    orderId: order.id,
    userId: order.userId,
    amountMinor: order.amountMinor,
    currency: order.currency,
    reason: '不再需要',
    status: RefundStatus.SUBMITTED,
  };
  const transaction = {
    order: {
      findUnique: jest.fn().mockResolvedValue(order),
      update: jest.fn().mockResolvedValue({
        ...order,
        status: OrderStatus.REFUND_PENDING,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    refund: {
      create: jest.fn().mockResolvedValue(createdRefund),
      findUnique: jest.fn().mockResolvedValue({
        ...createdRefund,
        order,
      }),
      update: jest.fn().mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...createdRefund, ...data }),
      ),
    },
    userPlan: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    $transaction: jest.fn(
      async (
        operation: (client: typeof transaction) => Promise<unknown>,
      ) => operation(transaction),
    ),
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
    service: new RefundsService(prisma, audit),
    transaction,
    audit,
  };
}

describe('RefundsService', () => {
  it('creates a full refund request for the user paid order', async () => {
    const harness = createHarness();

    await expect(
      harness.service.request('user_1', {
        orderId: 'order_1',
        amountMinor: 100,
        reason: ' 不再需要 ',
      }),
    ).resolves.toMatchObject({
      id: 'refund_1',
      status: RefundStatus.SUBMITTED,
    });
    expect(harness.transaction.refund.create).toHaveBeenCalledWith({
      data: {
        orderId: 'order_1',
        userId: 'user_1',
        amountMinor: 100,
        currency: 'CNY',
        reason: '不再需要',
      },
    });
    expect(harness.transaction.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'order_1',
        userId: 'user_1',
        status: OrderStatus.FULFILLED,
      },
      data: { status: OrderStatus.REFUND_PENDING },
    });
  });

  it('rejects a refund request that loses a concurrent status update', async () => {
    const harness = createHarness();
    harness.transaction.order.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      harness.service.request('user_1', {
        orderId: 'order_1',
        amountMinor: 100,
        reason: '并发退款测试',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(harness.transaction.refund.create).not.toHaveBeenCalled();
  });

  it('rejects refund requests for an unpaid order', async () => {
    const harness = createHarness({
      status: OrderStatus.PENDING_PAYMENT,
    });

    await expect(
      harness.service.request('user_1', {
        orderId: 'order_1',
        amountMinor: 100,
        reason: '不再需要',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects partial refunds because order state is all-or-nothing', async () => {
    const harness = createHarness();

    await expect(
      harness.service.request('user_1', {
        orderId: 'order_1',
        amountMinor: 50,
        reason: '申请部分退款',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('approves a submitted test refund through an audited transaction', async () => {
    const harness = createHarness();

    await expect(
      harness.service.review(
        'admin_1',
        'refund_1',
        'APPROVE',
        true,
      ),
    ).resolves.toMatchObject({ status: RefundStatus.APPROVED });
    expect(harness.audit.runInAuditedTransaction).toHaveBeenCalled();
  });

  it('completes only an approved test refund and cancels its plan', async () => {
    const harness = createHarness();
    harness.transaction.refund.findUnique.mockResolvedValue({
      id: 'refund_1',
      orderId: 'order_1',
      userId: 'user_1',
      amountMinor: 100,
      currency: 'CNY',
      reason: '不再需要',
      status: RefundStatus.APPROVED,
      order: {
        id: 'order_1',
        status: OrderStatus.REFUND_PENDING,
        paymentDriver: PaymentDriver.TEST,
      },
    });

    await expect(
      harness.service.completeTestRefund(
        'admin_1',
        'refund_1',
        true,
      ),
    ).resolves.toMatchObject({ status: RefundStatus.REFUNDED });
    expect(harness.transaction.order.update).toHaveBeenCalledWith({
      where: { id: 'order_1' },
      data: { status: OrderStatus.REFUNDED },
    });
    expect(harness.transaction.userPlan.updateMany).toHaveBeenCalledWith({
      where: {
        orderId: 'order_1',
        userId: 'user_1',
      },
      data: { status: UserPlanStatus.CANCELLED },
    });
  });

  it('does not simulate a refund for a real payment driver', async () => {
    const harness = createHarness();
    harness.transaction.refund.findUnique.mockResolvedValue({
      id: 'refund_1',
      orderId: 'order_1',
      userId: 'user_1',
      status: RefundStatus.APPROVED,
      order: {
        id: 'order_1',
        status: OrderStatus.REFUND_PENDING,
        paymentDriver: PaymentDriver.WECHAT,
      },
    });

    await expect(
      harness.service.completeTestRefund(
        'admin_1',
        'refund_1',
        true,
      ),
    ).rejects.toMatchObject({ code: 'REFUND_DRIVER_UNAVAILABLE' });
  });

  it('requires explicit confirmation for refund review', async () => {
    const harness = createHarness();

    await expect(
      harness.service.review(
        'admin_1',
        'refund_1',
        'APPROVE',
        false,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      harness.audit.runInAuditedTransaction,
    ).not.toHaveBeenCalled();
  });
});
