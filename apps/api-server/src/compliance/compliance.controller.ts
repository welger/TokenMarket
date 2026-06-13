import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  ComplianceService,
  type ComplianceProfileWriteInput,
} from './compliance.service.js';
import {
  ContentPolicyService,
  type ContentPolicyRuleWriteInput,
} from './content-policy.service.js';
import { ProductionReadinessService } from './production-readiness.service.js';
import type { AdminAuthenticatedRequest } from '../auth/admin-auth.types.js';
import { AdminJwtGuard } from '../auth/admin-jwt.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { AdminRole } from '../generated/prisma/client.js';

@Controller('public/compliance')
export class PublicComplianceController {
  constructor(
    private readonly complianceService: ComplianceService,
    private readonly contentPolicyService: ContentPolicyService,
  ) {}

  @Get()
  get() {
    return this.complianceService.getPublicProfile();
  }

  @Get('rules')
  listRules() {
    return this.contentPolicyService.listPublicRules();
  }
}

@Controller('admin/compliance')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(AdminRole.OWNER, AdminRole.OPERATOR)
export class AdminComplianceController {
  constructor(
    private readonly complianceService: ComplianceService,
    private readonly contentPolicyService: ContentPolicyService,
    private readonly productionReadinessService: ProductionReadinessService,
  ) {}

  @Get()
  @Roles(
    AdminRole.OWNER,
    AdminRole.OPERATOR,
    AdminRole.SUPPORT,
    AdminRole.AUDITOR,
  )
  get() {
    return this.complianceService.getAdminProfile();
  }

  @Get('production-readiness')
  @Roles(
    AdminRole.OWNER,
    AdminRole.OPERATOR,
    AdminRole.SUPPORT,
    AdminRole.AUDITOR,
  )
  getProductionReadiness() {
    return this.productionReadinessService.getReadiness();
  }

  @Put()
  update(
    @Req() request: AdminAuthenticatedRequest,
    @Body() body: ComplianceProfileWriteInput,
  ) {
    return this.complianceService.updateProfile(request.user!.sub, body);
  }

  @Post('enable-production')
  @Roles(AdminRole.OWNER)
  enableProduction(@Req() request: AdminAuthenticatedRequest) {
    return this.complianceService.enableProduction(request.user!.sub);
  }

  @Get('rules')
  @Roles(
    AdminRole.OWNER,
    AdminRole.OPERATOR,
    AdminRole.SUPPORT,
    AdminRole.AUDITOR,
  )
  listRules() {
    return this.contentPolicyService.listRules();
  }

  @Post('rules')
  createRule(
    @Req() request: AdminAuthenticatedRequest,
    @Body() body: ContentPolicyRuleWriteInput,
  ) {
    return this.contentPolicyService.createRule(request.user!.sub, body);
  }

  @Patch('rules/:id')
  updateRule(
    @Req() request: AdminAuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: ContentPolicyRuleWriteInput,
  ) {
    return this.contentPolicyService.updateRule(
      request.user!.sub,
      id,
      body,
    );
  }
}
