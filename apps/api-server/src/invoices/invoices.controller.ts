import {
  Body,
  ConflictException,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { InvoicesService } from './invoices.service.js';
import type { AdminAuthenticatedRequest } from '../auth/admin-auth.types.js';
import { AdminJwtGuard } from '../auth/admin-jwt.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import type { UserAuthenticatedRequest } from '../auth/user-auth.types.js';
import { UserJwtGuard } from '../auth/user-jwt.guard.js';
import { AdminRole } from '../generated/prisma/client.js';

@Controller('me/invoices')
@UseGuards(UserJwtGuard)
export class UserInvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  list(@Req() request: UserAuthenticatedRequest) {
    return this.invoicesService.listForUser(request.user!.sub);
  }

  @Post()
  request(
    @Req() request: UserAuthenticatedRequest,
    @Body()
    body: {
      orderIds?: unknown;
      title?: unknown;
      taxNumber?: unknown;
    },
  ) {
    return this.invoicesService.request(request.user!.sub, body);
  }
}

@Controller('admin/invoices')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(
  AdminRole.OWNER,
  AdminRole.OPERATOR,
  AdminRole.SUPPORT,
  AdminRole.AUDITOR,
)
export class AdminInvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  list() {
    return this.invoicesService.listAdmin();
  }

  @Post(':id/review')
  @Roles(AdminRole.OWNER, AdminRole.OPERATOR)
  review(
    @Req() request: AdminAuthenticatedRequest,
    @Param('id') id: string,
    @Body()
    body: {
      decision?: 'APPROVE' | 'REJECT';
      confirm?: boolean;
    },
  ) {
    if (body.confirm !== true) {
      throw new ConflictException(
        'Invoice review requires explicit confirmation',
      );
    }
    return this.invoicesService.review(
      request.user!.sub,
      id,
      body.decision as 'APPROVE' | 'REJECT',
    );
  }

  @Post(':id/issue')
  @Roles(AdminRole.OWNER, AdminRole.OPERATOR)
  issue(
    @Req() request: AdminAuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.invoicesService.issue(id, request.user!.sub);
  }
}
