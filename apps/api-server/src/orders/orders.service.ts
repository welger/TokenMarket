import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../common/config/env.schema.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import {
  FulfillmentType,
  OrderStatus,
  PaymentDriver as PaymentDriverName,
  PlanActivationMode,
  PlanStatus,
  UsageLedgerType,
  UserPlanStatus,
} from '../generated/prisma/client.js';
import type { PaymentContext } from './payment-driver.js';
import { transitionOrder } from './order-state-machine.js';
import { TestPaymentDriver } from './test-payment.driver.js';

export const ORDER_CLOCK = Symbol('ORDER_CLOCK');
const ORDER_NUMBER_PREFIX = 'ord_';
const ORDER_NUMBER_RANDOM_LENGTH = 28;

export interface CreateOrderInput {
  planId?: unknown;
  idempotencyKey?: unknown;
}

export interface FulfillmentResult {
  order: unknown;
  userPlan: unknown;
  paymentLabel: string;
}

export interface WechatPaymentInput {
  orderNumber: string;
  transactionId: string;
  amountMinor: number;
  currency: string;
}

export class PaymentAmountMismatchException extends ConflictException {
  readonly code = 'PAYMENT_AMOUNT_MISMATCH';

  constructor() {
    super({
      code: 'PAYMENT_AMOUNT_MISMATCH',
      message: '支付金额与订单金额不一致',
    });
  }
}

function createOrderNumber(): string {
  return `${ORDER_NUMBER_PREFIX}${randomUUID()
    .replaceAll('-', '')
    .slice(0, ORDER_NUMBER_RANDOM_LENGTH)}`;
}

@Injectable()
export class OrdersService {
  private readonly now: () => Date;

  constructor(
    private readonly prisma: PrismaService,
    private readonly testPaymentDriver: TestPaymentDriver,
    @Optional()
    @Inject(ORDER_CLOCK)
    clock?: () => Date,
    @Optional()
    private readonly config?: ConfigService<EnvironmentVariables, true>,
  ) {
    this.now = clock ?? (() => new Date());
  }

  listForUser(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: { plan: true, refunds: true, invoiceOrders: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  listAdmin() {
    return this.prisma.order.findMany({
      include: { plan: true, user: true, refunds: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async payAndFulfillAsAdmin(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { userId: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return this.payAndFulfill(order.userId, orderId, {
      isAdmin: true,
    });
  }

  async create(userId: string, input: CreateOrderInput) {
    const planId = this.requiredText(input.planId, 'planId', 100);
    const idempotencyKey = this.requiredText(
      input.idempotencyKey,
      'idempotencyKey',
      200,
    );
    const existing = await this.prisma.order.findUnique({
      where: {
        userId_idempotencyKey: { userId, idempotencyKey },
      },
      include: { plan: true },
    });
    if (existing) {
      if (existing.planId !== planId) {
        throw new ConflictException(
          'Idempotency key belongs to another plan order',
        );
      }
      return existing;
    }

    const plan = await this.prisma.plan.findUnique({
      where: { id: planId },
    });
    if (!plan || plan.status !== PlanStatus.ACTIVE) {
      throw new NotFoundException('Active plan not found');
    }

    return this.prisma.order.create({
      data: {
        orderNumber: createOrderNumber(),
        userId,
        planId: plan.id,
        amountMinor: plan.priceMinor,
        currency: plan.currency,
        paymentDriver: this.paymentDriverForNewOrder(),
        idempotencyKey,
      },
      include: { plan: true },
    });
  }

  payAndFulfill(
    userId: string,
    orderId: string,
    context: PaymentContext,
  ): Promise<FulfillmentResult> {
    return this.prisma.$transaction(async (transaction) => {
      const order = await transaction.order.findUnique({
        where: { id: orderId },
        include: { plan: true },
      });
      if (!order || order.userId !== userId) {
        throw new NotFoundException('Order not found');
      }

      const existingUserPlan =
        order.status === OrderStatus.FULFILLED
          ? await transaction.userPlan.findUnique({
              where: {
                orderId_fulfillmentType: {
                  orderId: order.id,
                  fulfillmentType: FulfillmentType.PURCHASE,
                },
              },
            })
          : null;
      if (existingUserPlan) {
        return {
          order,
          userPlan: existingUserPlan,
          paymentLabel: this.paymentLabel(order.paymentDriver),
        };
      }
      if (order.status !== OrderStatus.PENDING_PAYMENT) {
        throw new ConflictException('Order cannot be paid');
      }
      if (order.paymentDriver !== PaymentDriverName.TEST) {
        throw new ConflictException(
          'Test payment cannot process this order',
        );
      }

      const payment = await this.testPaymentDriver.pay(order, context);
      const now = this.now();
      const paidStatus = transitionOrder(order.status, 'PAY');
      const fulfilledStatus = transitionOrder(paidStatus, 'FULFILL');
      const immediatelyActive =
        order.plan.activationMode === PlanActivationMode.IMMEDIATE;
      const expiresAt = immediatelyActive
        ? this.addDays(now, order.plan.validityDays)
        : null;
      const userPlan = await transaction.userPlan.create({
        data: {
          userId,
          planId: order.planId,
          orderId: order.id,
          fulfillmentType: FulfillmentType.PURCHASE,
          status: immediatelyActive
            ? UserPlanStatus.ACTIVE
            : UserPlanStatus.PENDING,
          initialInputQuota: order.plan.inputQuota,
          remainingInputQuota: order.plan.inputQuota,
          initialOutputQuota: order.plan.outputQuota,
          remainingOutputQuota: order.plan.outputQuota,
          initialUnifiedQuota: order.plan.unifiedQuota,
          remainingUnifiedQuota: order.plan.unifiedQuota,
          activatedAt: immediatelyActive ? now : null,
          expiresAt,
        },
      });
      await transaction.usageLedger.create({
        data: {
          userId,
          userPlanId: userPlan.id,
          type: UsageLedgerType.GRANT,
          inputUnits: order.plan.inputQuota ?? 0n,
          outputUnits: order.plan.outputQuota ?? 0n,
          chargedUnits:
            order.plan.unifiedQuota ??
            (order.plan.inputQuota ?? 0n) +
              (order.plan.outputQuota ?? 0n),
          remainingInput: order.plan.inputQuota,
          remainingOutput: order.plan.outputQuota,
          remainingUnified: order.plan.unifiedQuota,
          description: '订单套餐发放',
        },
      });
      const updatedOrder = await transaction.order.update({
        where: { id: order.id },
        data: {
          status: fulfilledStatus,
          paymentReference: payment.paymentReference,
          paidAt: now,
          fulfilledAt: now,
        },
        include: { plan: true },
      });

      return {
        order: updatedOrder,
        userPlan,
        paymentLabel: payment.displayLabel,
      };
    });
  }

  applyWechatPayment(
    input: WechatPaymentInput,
  ): Promise<FulfillmentResult> {
    return this.prisma.$transaction(async (transaction) => {
      const order = await transaction.order.findUnique({
        where: { orderNumber: input.orderNumber },
        include: { plan: true },
      });
      if (!order) {
        throw new NotFoundException('Order not found');
      }
      if (order.paymentDriver !== PaymentDriverName.WECHAT) {
        throw new ConflictException('Order is not a WeChat payment');
      }

      const existingUserPlan =
        order.status === OrderStatus.FULFILLED
          ? await transaction.userPlan.findUnique({
              where: {
                orderId_fulfillmentType: {
                  orderId: order.id,
                  fulfillmentType: FulfillmentType.PURCHASE,
                },
              },
            })
          : null;
      if (existingUserPlan) {
        return {
          order,
          userPlan: existingUserPlan,
          paymentLabel: '微信支付',
        };
      }
      if (order.status !== OrderStatus.PENDING_PAYMENT) {
        throw new ConflictException('Order cannot be paid');
      }
      if (
        order.amountMinor !== input.amountMinor ||
        order.currency !== input.currency
      ) {
        throw new PaymentAmountMismatchException();
      }

      const now = this.now();
      const paidStatus = transitionOrder(order.status, 'PAY');
      const fulfilledStatus = transitionOrder(paidStatus, 'FULFILL');
      const immediatelyActive =
        order.plan.activationMode === PlanActivationMode.IMMEDIATE;
      const expiresAt = immediatelyActive
        ? this.addDays(now, order.plan.validityDays)
        : null;
      const userPlan = await transaction.userPlan.create({
        data: {
          userId: order.userId,
          planId: order.planId,
          orderId: order.id,
          fulfillmentType: FulfillmentType.PURCHASE,
          status: immediatelyActive
            ? UserPlanStatus.ACTIVE
            : UserPlanStatus.PENDING,
          initialInputQuota: order.plan.inputQuota,
          remainingInputQuota: order.plan.inputQuota,
          initialOutputQuota: order.plan.outputQuota,
          remainingOutputQuota: order.plan.outputQuota,
          initialUnifiedQuota: order.plan.unifiedQuota,
          remainingUnifiedQuota: order.plan.unifiedQuota,
          activatedAt: immediatelyActive ? now : null,
          expiresAt,
        },
      });
      await transaction.usageLedger.create({
        data: {
          userId: order.userId,
          userPlanId: userPlan.id,
          type: UsageLedgerType.GRANT,
          inputUnits: order.plan.inputQuota ?? 0n,
          outputUnits: order.plan.outputQuota ?? 0n,
          chargedUnits:
            order.plan.unifiedQuota ??
            (order.plan.inputQuota ?? 0n) +
              (order.plan.outputQuota ?? 0n),
          remainingInput: order.plan.inputQuota,
          remainingOutput: order.plan.outputQuota,
          remainingUnified: order.plan.unifiedQuota,
          description: '订单套餐发放',
        },
      });
      const updatedOrder = await transaction.order.update({
        where: { id: order.id },
        data: {
          status: fulfilledStatus,
          paymentReference: `wechat:${input.transactionId}`,
          paidAt: now,
          fulfilledAt: now,
        },
        include: { plan: true },
      });

      return {
        order: updatedOrder,
        userPlan,
        paymentLabel: '微信支付',
      };
    });
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

  private addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private paymentLabel(driver: PaymentDriverName): string {
    return driver === PaymentDriverName.TEST ? '测试支付' : '微信支付';
  }

  private paymentDriverForNewOrder(): PaymentDriverName {
    return this.config?.get('PAYMENT_DRIVER', { infer: true }) ===
      'wechat'
      ? PaymentDriverName.WECHAT
      : PaymentDriverName.TEST;
  }
}
