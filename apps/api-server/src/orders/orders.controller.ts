import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  OrdersService,
  type CreateOrderInput,
} from './orders.service.js';
import type { AdminAuthenticatedRequest } from '../auth/admin-auth.types.js';
import { AdminJwtGuard } from '../auth/admin-jwt.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import type { UserAuthenticatedRequest } from '../auth/user-auth.types.js';
import { UserJwtGuard } from '../auth/user-jwt.guard.js';
import { toJsonSafe } from '../common/http/json-safe.js';
import { AdminRole } from '../generated/prisma/client.js';

@Controller('me/orders')
@UseGuards(UserJwtGuard)
export class UserOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  async list(@Req() request: UserAuthenticatedRequest) {
    return toJsonSafe(
      await this.ordersService.listForUser(request.user!.sub),
    );
  }

  @Post()
  async create(
    @Req() request: UserAuthenticatedRequest,
    @Body() body: CreateOrderInput,
  ) {
    return toJsonSafe(
      await this.ordersService.create(request.user!.sub, body),
    );
  }

  @Post(':id/pay-test')
  async payTest(
    @Req() request: UserAuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return toJsonSafe(
      await this.ordersService.payAndFulfill(
        request.user!.sub,
        id,
        { isAdmin: false },
      ),
    );
  }
}

@Controller('admin/orders')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(
  AdminRole.OWNER,
  AdminRole.OPERATOR,
  AdminRole.SUPPORT,
  AdminRole.AUDITOR,
)
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  async list(@Req() _request: AdminAuthenticatedRequest) {
    return toJsonSafe(await this.ordersService.listAdmin());
  }

  @Post(':id/pay-test')
  @Roles(AdminRole.OWNER, AdminRole.OPERATOR)
  async payTest(@Param('id') id: string) {
    return toJsonSafe(
      await this.ordersService.payAndFulfillAsAdmin(id),
    );
  }
}
