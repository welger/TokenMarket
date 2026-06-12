import { Module } from '@nestjs/common';

import { ApiKeysController } from './api-keys.controller.js';
import {
  ApiKeyAuthCache,
  ApiKeysService,
} from './api-keys.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [ApiKeysController],
  providers: [ApiKeyAuthCache, ApiKeysService],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
