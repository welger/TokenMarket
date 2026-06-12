import { ForbiddenException, Injectable } from '@nestjs/common';

import type {
  PayableOrder,
  PaymentContext,
  PaymentDriver,
  PaymentResult,
} from './payment-driver.js';
import type { NodeEnvironment } from '../common/config/env.schema.js';

@Injectable()
export class TestPaymentDriver implements PaymentDriver {
  constructor(private readonly environment: NodeEnvironment) {}

  async pay(
    order: PayableOrder,
    context: PaymentContext,
  ): Promise<PaymentResult> {
    if (this.environment !== 'test' && !context.isAdmin) {
      throw new ForbiddenException('Test payment is not available');
    }

    return {
      driver: 'test',
      paymentReference: `test:${order.id}`,
      displayLabel: '测试支付',
    };
  }
}
