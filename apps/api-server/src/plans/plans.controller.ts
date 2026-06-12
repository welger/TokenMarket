import {
  Body,
  ConflictException,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  PlansService,
  type PlanWriteInput,
} from './plans.service.js';
import type { AdminAuthenticatedRequest } from '../auth/admin-auth.types.js';
import { AdminJwtGuard } from '../auth/admin-jwt.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { toJsonSafe } from '../common/http/json-safe.js';
import { AdminRole } from '../generated/prisma/client.js';

@Controller('public/plans')
export class PublicPlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  list() {
    return this.plansService.listPublic();
  }
}

@Controller('admin/plans')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(AdminRole.OWNER, AdminRole.OPERATOR)
export class AdminPlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  @Roles(
    AdminRole.OWNER,
    AdminRole.OPERATOR,
    AdminRole.SUPPORT,
    AdminRole.AUDITOR,
  )
  async list() {
    return toJsonSafe(await this.plansService.listAdmin());
  }

  @Post()
  async create(
    @Req() request: AdminAuthenticatedRequest,
    @Body() body: PlanWriteInput,
  ) {
    return toJsonSafe(
      await this.plansService.create(request.user!.sub, body),
    );
  }

  @Patch(':id')
  async update(
    @Req() request: AdminAuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: PlanWriteInput & { confirm?: boolean },
  ) {
    if (body.confirm !== true) {
      throw new ConflictException(
        'Plan update requires explicit confirmation',
      );
    }
    const { confirm: _confirm, ...input } = body;
    return toJsonSafe(
      await this.plansService.update(request.user!.sub, id, input),
    );
  }
}
