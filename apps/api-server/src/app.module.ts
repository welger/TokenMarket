import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuditModule } from './audit/audit.module.js';
import { ApiKeysModule } from './api-keys/api-keys.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ComplianceModule } from './compliance/compliance.module.js';
import { validateEnv } from './common/config/env.schema.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { ModelsModule } from './models/models.module.js';
import { InvoicesModule } from './invoices/invoices.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PlansModule } from './plans/plans.module.js';
import { ProvidersModule } from './providers/providers.module.js';
import { RefundsModule } from './refunds/refunds.module.js';
import { GatewayModule } from './gateway/gateway.module.js';
import { UsageModule } from './usage/usage.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    AuditModule,
    ApiKeysModule,
    ProvidersModule,
    ModelsModule,
    ComplianceModule,
    PlansModule,
    OrdersModule,
    PaymentsModule,
    RefundsModule,
    InvoicesModule,
    GatewayModule,
    UsageModule,
  ],
})
export class AppModule {}
