import { Module } from '@nestjs/common';

import {
  AdminInvoicesController,
  UserInvoicesController,
} from './invoices.controller.js';
import { InvoicesService } from './invoices.service.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [UserInvoicesController, AdminInvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
