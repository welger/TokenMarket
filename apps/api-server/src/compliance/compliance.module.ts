import { Module } from '@nestjs/common';

import {
  AdminComplianceController,
  PublicComplianceController,
} from './compliance.controller.js';
import { ComplianceService } from './compliance.service.js';
import { ContentPolicyService } from './content-policy.service.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [
    PublicComplianceController,
    AdminComplianceController,
  ],
  providers: [ComplianceService, ContentPolicyService],
  exports: [ComplianceService, ContentPolicyService],
})
export class ComplianceModule {}
