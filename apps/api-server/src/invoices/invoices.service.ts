import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import {
  InvoiceStatus,
  OrderStatus,
} from '../generated/prisma/client.js';

export class InvoiceDriverUnavailableException extends ConflictException {
  readonly code = 'INVOICE_DRIVER_UNAVAILABLE';

  constructor() {
    super({
      code: 'INVOICE_DRIVER_UNAVAILABLE',
      message: '真实开票驱动未配置',
    });
  }
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  listForUser(userId: string) {
    return this.prisma.invoice.findMany({
      where: { userId },
      include: { invoiceOrders: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  listAdmin() {
    return this.prisma.invoice.findMany({
      include: {
        invoiceOrders: true,
        user: true,
        reviewedByAdmin: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  request(
    userId: string,
    input: {
      orderIds?: unknown;
      title?: unknown;
      taxNumber?: unknown;
    },
  ) {
    const orderIds = this.orderIds(input.orderIds);
    const title = this.requiredText(input.title, 'title', 200);
    const taxNumber =
      input.taxNumber === undefined ||
      input.taxNumber === null ||
      input.taxNumber === ''
        ? null
        : this.requiredText(input.taxNumber, 'taxNumber', 100);

    return this.prisma.$transaction(async (transaction) => {
      const orders = await transaction.order.findMany({
        where: {
          id: { in: orderIds },
          userId,
        },
        include: {
          invoiceOrders: {
            where: {
              invoice: {
                status: { not: InvoiceStatus.REJECTED },
              },
            },
            select: {
              invoice: { select: { status: true } },
            },
          },
        },
      });
      if (orders.length !== orderIds.length) {
        throw new NotFoundException('One or more orders were not found');
      }
      if (
        orders.some(
          (order) =>
            order.status !== OrderStatus.PAID &&
            order.status !== OrderStatus.FULFILLED,
        )
      ) {
        throw new ConflictException(
          'Only paid orders can be invoiced',
        );
      }
      if (orders.some((order) => order.invoiceOrders.length > 0)) {
        throw new ConflictException(
          'An order is already attached to an invoice',
        );
      }
      const currency = orders[0]!.currency;
      if (orders.some((order) => order.currency !== currency)) {
        throw new ConflictException(
          'Invoice orders must use the same currency',
        );
      }

      return transaction.invoice.create({
        data: {
          userId,
          title,
          taxNumber,
          amountMinor: orders.reduce(
            (total, order) => total + order.amountMinor,
            0,
          ),
          currency,
          invoiceOrders: {
            create: orderIds.map((orderId) => ({ orderId })),
          },
        },
        include: { invoiceOrders: true },
      });
    });
  }

  review(
    adminUserId: string,
    invoiceId: string,
    decision: 'APPROVE' | 'REJECT',
  ) {
    if (decision !== 'APPROVE' && decision !== 'REJECT') {
      throw new BadRequestException('Invalid invoice decision');
    }
    return this.auditService.runInAuditedTransaction(
      {
        adminUserId,
        action:
          decision === 'APPROVE'
            ? 'INVOICE_APPROVED'
            : 'INVOICE_REJECTED',
        resourceType: 'invoice',
        resourceId: invoiceId,
      },
      async ({
        transaction,
        setBeforeSummary,
        setAfterSummary,
      }) => {
        const invoice = await transaction.invoice.findUnique({
          where: { id: invoiceId },
        });
        if (!invoice) {
          throw new NotFoundException('Invoice not found');
        }
        if (invoice.status !== InvoiceStatus.SUBMITTED) {
          throw new ConflictException(
            'Invoice is not awaiting review',
          );
        }
        const updated = await transaction.invoice.update({
          where: { id: invoiceId },
          data: {
            status:
              decision === 'APPROVE'
                ? InvoiceStatus.APPROVED
                : InvoiceStatus.REJECTED,
            reviewedByAdminId: adminUserId,
            reviewedAt: new Date(),
          },
        });
        if (decision === 'REJECT') {
          await transaction.invoiceOrder.deleteMany({
            where: { invoiceId },
          });
        }
        setBeforeSummary({ status: invoice.status });
        setAfterSummary({ status: updated.status });
        return updated;
      },
    );
  }

  async issue(
    _invoiceId: string,
    _adminUserId: string,
  ): Promise<never> {
    throw new InvoiceDriverUnavailableException();
  }

  private orderIds(value: unknown): string[] {
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      value.length > 100 ||
      value.some(
        (orderId) =>
          typeof orderId !== 'string' ||
          orderId.trim().length === 0 ||
          orderId.trim().length > 100,
      )
    ) {
      throw new BadRequestException('Invalid orderIds');
    }
    const normalized = [
      ...new Set(value.map((orderId) => orderId.trim())),
    ];
    if (normalized.length !== value.length) {
      throw new BadRequestException('Duplicate orderIds');
    }
    return normalized;
  }

  private requiredText(
    value: unknown,
    field: string,
    maxLength: number,
  ): string {
    if (
      typeof value !== 'string' ||
      value.trim().length === 0 ||
      value.trim().length > maxLength
    ) {
      throw new BadRequestException(`Invalid ${field}`);
    }
    return value.trim();
  }
}
