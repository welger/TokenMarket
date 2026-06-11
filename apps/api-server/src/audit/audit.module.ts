import { Module } from '@nestjs/common';

import { AuditInterceptor } from './audit.interceptor.js';
import { AuditService } from './audit.service.js';

@Module({
  providers: [AuditService, AuditInterceptor],
  exports: [AuditService, AuditInterceptor],
})
export class AuditModule {}
