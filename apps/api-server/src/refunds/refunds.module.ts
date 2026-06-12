import { Module } from '@nestjs/common';

import {
  AdminRefundsController,
  UserRefundsController,
} from './refunds.controller.js';
import { RefundsService } from './refunds.service.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [UserRefundsController, AdminRefundsController],
  providers: [RefundsService],
  exports: [RefundsService],
})
export class RefundsModule {}
