import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import {
  OrderStatus,
  PaymentDriver,
  RefundStatus,
  UserPlanStatus,
} from '../generated/prisma/client.js';
import { transitionOrder } from '../orders/order-state-machine.js';

export class RefundDriverUnavailableException extends ConflictException {
  readonly code = 'REFUND_DRIVER_UNAVAILABLE';

  constructor() {
    super({
      code: 'REFUND_DRIVER_UNAVAILABLE',
      message: '真实退款驱动未配置',
    });
  }
}

export interface RefundRequestInput {
  orderId?: unknown;
  amountMinor?: unknown;
  reason?: unknown;
}

export type RefundReviewDecision = 'APPROVE' | 'REJECT';

@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  listForUser(userId: string) {
    return this.prisma.refund.findMany({
      where: { userId },
      include: { order: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  listAdmin() {
    return this.prisma.refund.findMany({
      include: { order: true, user: true, reviewedByAdmin: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  request(userId: string, input: RefundRequestInput) {
    const orderId = this.requiredText(input.orderId, 'orderId', 100);
    const reason = this.requiredText(input.reason, 'reason', 500);
    if (
      typeof input.amountMinor !== 'number' ||
      !Number.isInteger(input.amountMinor) ||
      input.amountMinor <= 0
    ) {
      throw new BadRequestException('Invalid amountMinor');
    }

    return this.prisma.$transaction(async (transaction) => {
      const order = await transaction.order.findUnique({
        where: { id: orderId },
      });
      if (!order || order.userId !== userId) {
        throw new NotFoundException('Order not found');
      }
      if (
        order.status !== OrderStatus.PAID &&
        order.status !== OrderStatus.FULFILLED
      ) {
        throw new ConflictException('Order is not refundable');
      }
      if (input.amountMinor !== order.amountMinor) {
        throw new ConflictException(
          'Only full-order refunds are supported',
        );
      }

      const transition = await transaction.order.updateMany({
        where: {
          id: orderId,
          userId,
          status: order.status,
        },
        data: {
          status: transitionOrder(order.status, 'REQUEST_REFUND'),
        },
      });
      if (transition.count !== 1) {
        throw new ConflictException(
          'Order refund state changed concurrently',
        );
      }
      const refund = await transaction.refund.create({
        data: {
          orderId,
          userId,
          amountMinor: input.amountMinor,
          currency: order.currency,
          reason,
        },
      });
      return refund;
    });
  }

  async review(
    adminUserId: string,
    refundId: string,
    decision: RefundReviewDecision,
    confirmed: boolean,
  ) {
    if (decision !== 'APPROVE' && decision !== 'REJECT') {
      throw new BadRequestException('Invalid refund decision');
    }
    if (!confirmed) {
      throw new ConflictException(
        'Refund review requires explicit confirmation',
      );
    }

    return this.auditService.runInAuditedTransaction(
      {
        adminUserId,
        action:
          decision === 'APPROVE'
            ? 'REFUND_APPROVED'
            : 'REFUND_REJECTED',
        resourceType: 'refund',
        resourceId: refundId,
      },
      async ({
        transaction,
        setBeforeSummary,
        setAfterSummary,
      }) => {
        const refund = await transaction.refund.findUnique({
          where: { id: refundId },
          include: { order: true },
        });
        if (!refund) {
          throw new NotFoundException('Refund not found');
        }
        if (refund.status !== RefundStatus.SUBMITTED) {
          throw new ConflictException('Refund is not awaiting review');
        }
        if (
          decision === 'APPROVE' &&
          refund.order.paymentDriver !== PaymentDriver.TEST
        ) {
          throw new RefundDriverUnavailableException();
        }

        const now = new Date();
        const status =
          decision === 'APPROVE'
            ? RefundStatus.APPROVED
            : RefundStatus.REJECTED;
        const updated = await transaction.refund.update({
          where: { id: refund.id },
          data: {
            status,
            reviewedByAdminId: adminUserId,
            reviewedAt: now,
          },
        });
        if (decision === 'REJECT') {
          await transaction.order.update({
            where: { id: refund.orderId },
            data: {
              status: transitionOrder(
                refund.order.status,
                'REJECT_REFUND',
              ),
            },
          });
        }
        setBeforeSummary({ status: refund.status });
        setAfterSummary({ status: updated.status });
        return updated;
      },
    );
  }

  async completeTestRefund(
    adminUserId: string,
    refundId: string,
    confirmed: boolean,
  ) {
    if (!confirmed) {
      throw new ConflictException(
        'Test refund requires explicit confirmation',
      );
    }
    return this.auditService.runInAuditedTransaction(
      {
        adminUserId,
        action: 'TEST_REFUND_COMPLETED',
        resourceType: 'refund',
        resourceId: refundId,
      },
      async ({
        transaction,
        setBeforeSummary,
        setAfterSummary,
      }) => {
        const refund = await transaction.refund.findUnique({
          where: { id: refundId },
          include: { order: true },
        });
        if (!refund) {
          throw new NotFoundException('Refund not found');
        }
        if (refund.order.paymentDriver !== PaymentDriver.TEST) {
          throw new RefundDriverUnavailableException();
        }
        if (
          refund.status !== RefundStatus.APPROVED ||
          refund.order.status !== OrderStatus.REFUND_PENDING
        ) {
          throw new ConflictException(
            'Test refund is not ready for completion',
          );
        }

        const now = new Date();
        const updated = await transaction.refund.update({
          where: { id: refund.id },
          data: {
            status: RefundStatus.REFUNDED,
            completedAt: now,
          },
        });
        await transaction.order.update({
          where: { id: refund.orderId },
          data: {
            status: transitionOrder(refund.order.status, 'REFUND'),
          },
        });
        await transaction.userPlan.updateMany({
          where: {
            orderId: refund.orderId,
            userId: refund.userId,
          },
          data: { status: UserPlanStatus.CANCELLED },
        });
        setBeforeSummary({ status: refund.status });
        setAfterSummary({ status: updated.status });
        return updated;
      },
    );
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
