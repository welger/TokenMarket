import { ConflictException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { InvoicesService } from './invoices.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import {
  InvoiceStatus,
  OrderStatus,
} from '../generated/prisma/client.js';

function createHarness() {
  const orders = [
    {
      id: 'order_1',
      userId: 'user_1',
      amountMinor: 100,
      currency: 'CNY',
      status: OrderStatus.FULFILLED,
      invoiceOrders: [],
    },
    {
      id: 'order_2',
      userId: 'user_1',
      amountMinor: 200,
      currency: 'CNY',
      status: OrderStatus.PAID,
      invoiceOrders: [],
    },
  ];
  const createdInvoice = {
    id: 'invoice_1',
    userId: 'user_1',
    title: '测试抬头',
    taxNumber: null,
    amountMinor: 300,
    currency: 'CNY',
    status: InvoiceStatus.SUBMITTED,
  };
  const transaction = {
    order: {
      findMany: jest.fn().mockResolvedValue(orders),
    },
    invoice: {
      create: jest.fn().mockResolvedValue(createdInvoice),
      findUnique: jest.fn().mockResolvedValue(createdInvoice),
      update: jest.fn().mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...createdInvoice, ...data }),
      ),
    },
    invoiceOrder: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
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
    service: new InvoicesService(prisma, audit),
    transaction,
    audit,
  };
}

describe('InvoicesService', () => {
  it('creates an invoice request from eligible user orders', async () => {
    const harness = createHarness();

    await expect(
      harness.service.request('user_1', {
        orderIds: ['order_1', 'order_2'],
        title: ' 测试抬头 ',
      }),
    ).resolves.toMatchObject({
      id: 'invoice_1',
      amountMinor: 300,
      status: InvoiceStatus.SUBMITTED,
    });
    expect(harness.transaction.invoice.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        title: '测试抬头',
        taxNumber: null,
        amountMinor: 300,
        currency: 'CNY',
        invoiceOrders: {
          create: [
            { orderId: 'order_1' },
            { orderId: 'order_2' },
          ],
        },
      },
      include: { invoiceOrders: true },
    });
  });

  it('rejects an order already attached to a non-rejected invoice', async () => {
    const harness = createHarness();
    harness.transaction.order.findMany.mockResolvedValue([
      {
        id: 'order_1',
        userId: 'user_1',
        amountMinor: 100,
        currency: 'CNY',
        status: OrderStatus.FULFILLED,
        invoiceOrders: [
          { invoice: { status: InvoiceStatus.SUBMITTED } },
        ],
      },
    ]);

    await expect(
      harness.service.request('user_1', {
        orderIds: ['order_1'],
        title: '测试抬头',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('approves a submitted invoice through an audited transaction', async () => {
    const harness = createHarness();

    await expect(
      harness.service.review('admin_1', 'invoice_1', 'APPROVE'),
    ).resolves.toMatchObject({ status: InvoiceStatus.APPROVED });
    expect(harness.audit.runInAuditedTransaction).toHaveBeenCalled();
  });

  it('releases order associations when an invoice is rejected', async () => {
    const harness = createHarness();

    await harness.service.review(
      'admin_1',
      'invoice_1',
      'REJECT',
    );

    expect(
      harness.transaction.invoiceOrder.deleteMany,
    ).toHaveBeenCalledWith({
      where: { invoiceId: 'invoice_1' },
    });
  });

  it('does not issue an invoice without a real invoice driver', async () => {
    const harness = createHarness();

    await expect(
      harness.service.issue('invoice_1', 'admin_1'),
    ).rejects.toMatchObject<
      Partial<ConflictException> & { code: string }
    >({ code: 'INVOICE_DRIVER_UNAVAILABLE' });
  });
});
