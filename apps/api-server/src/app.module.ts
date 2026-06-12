import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ComplianceModule } from './compliance/compliance.module.js';
import { validateEnv } from './common/config/env.schema.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { ModelsModule } from './models/models.module.js';
import { ProvidersModule } from './providers/providers.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    AuditModule,
    ProvidersModule,
    ModelsModule,
    ComplianceModule,
  ],
})
export class AppModule {}
