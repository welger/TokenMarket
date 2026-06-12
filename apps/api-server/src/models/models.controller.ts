import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  ModelsService,
  type ModelWriteInput,
} from './models.service.js';
import type { AdminAuthenticatedRequest } from '../auth/admin-auth.types.js';
import { AdminJwtGuard } from '../auth/admin-jwt.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { AdminRole } from '../generated/prisma/client.js';

@Controller('public/models')
export class PublicModelsController {
  constructor(private readonly modelsService: ModelsService) {}

  @Get()
  list() {
    return this.modelsService.listPublic();
  }
}

@Controller('admin/models')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(AdminRole.OWNER, AdminRole.OPERATOR)
export class AdminModelsController {
  constructor(private readonly modelsService: ModelsService) {}

  @Get()
  @Roles(
    AdminRole.OWNER,
    AdminRole.OPERATOR,
    AdminRole.SUPPORT,
    AdminRole.AUDITOR,
  )
  list() {
    return this.modelsService.listAdmin();
  }

  @Post()
  create(
    @Req() request: AdminAuthenticatedRequest,
    @Body() body: ModelWriteInput,
  ) {
    return this.modelsService.create(request.user!.sub, body);
  }

  @Patch(':id')
  update(
    @Req() request: AdminAuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: ModelWriteInput,
  ) {
    return this.modelsService.update(request.user!.sub, id, body);
  }
}
