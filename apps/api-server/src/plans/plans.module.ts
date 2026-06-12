import { Module } from '@nestjs/common';

import {
  AdminPlansController,
  PublicPlansController,
} from './plans.controller.js';
import { PlansService } from './plans.service.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [PublicPlansController, AdminPlansController],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
