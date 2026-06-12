import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AdminOrdersController,
  UserOrdersController,
} from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { TestPaymentDriver } from './test-payment.driver.js';
import { AuthModule } from '../auth/auth.module.js';
import type { EnvironmentVariables } from '../common/config/env.schema.js';

@Module({
  imports: [AuthModule],
  controllers: [UserOrdersController, AdminOrdersController],
  providers: [
    {
      provide: TestPaymentDriver,
      inject: [ConfigService],
      useFactory: (
        config: ConfigService<EnvironmentVariables, true>,
      ) =>
        new TestPaymentDriver(
          config.get('NODE_ENV', { infer: true }),
        ),
    },
    OrdersService,
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
