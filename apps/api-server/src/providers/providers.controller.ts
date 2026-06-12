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
  ProvidersService,
  type ProviderWriteInput,
} from './providers.service.js';
import type { AdminAuthenticatedRequest } from '../auth/admin-auth.types.js';
import { AdminJwtGuard } from '../auth/admin-jwt.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { AdminRole } from '../generated/prisma/client.js';

@Controller('admin/providers')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(AdminRole.OWNER, AdminRole.OPERATOR)
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get()
  @Roles(
    AdminRole.OWNER,
    AdminRole.OPERATOR,
    AdminRole.SUPPORT,
    AdminRole.AUDITOR,
  )
  list() {
    return this.providersService.listAdmin();
  }

  @Post()
  create(
    @Req() request: AdminAuthenticatedRequest,
    @Body() body: ProviderWriteInput,
  ) {
    return this.providersService.create(request.user!.sub, body);
  }

  @Patch(':id')
  update(
    @Req() request: AdminAuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: ProviderWriteInput,
  ) {
    return this.providersService.update(request.user!.sub, id, body);
  }
}
