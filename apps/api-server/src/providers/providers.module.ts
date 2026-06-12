import { Module } from '@nestjs/common';

import { OpenAiCompatibleClient } from './openai-compatible.client.js';
import { ProvidersController } from './providers.controller.js';
import { ProvidersService } from './providers.service.js';
import { TestProviderClient } from './test-provider.client.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [ProvidersController],
  providers: [
    ProvidersService,
    OpenAiCompatibleClient,
    TestProviderClient,
  ],
  exports: [
    ProvidersService,
    OpenAiCompatibleClient,
    TestProviderClient,
  ],
})
export class ProvidersModule {}
