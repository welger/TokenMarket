import { Module } from '@nestjs/common';

import {
  AdminModelsController,
  PublicModelsController,
} from './models.controller.js';
import { ModelsService } from './models.service.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [PublicModelsController, AdminModelsController],
  providers: [ModelsService],
  exports: [ModelsService],
})
export class ModelsModule {}
