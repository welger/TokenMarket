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
  RefundsService,
  type RefundRequestInput,
  type RefundReviewDecision,
} from './refunds.service.js';
import type { AdminAuthenticatedRequest } from '../auth/admin-auth.types.js';
import { AdminJwtGuard } from '../auth/admin-jwt.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import type { UserAuthenticatedRequest } from '../auth/user-auth.types.js';
import { UserJwtGuard } from '../auth/user-jwt.guard.js';
import { AdminRole } from '../generated/prisma/client.js';

@Controller('me/refunds')
@UseGuards(UserJwtGuard)
export class UserRefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Get()
  list(@Req() request: UserAuthenticatedRequest) {
    return this.refundsService.listForUser(request.user!.sub);
  }

  @Post()
  request(
    @Req() request: UserAuthenticatedRequest,
    @Body() body: RefundRequestInput,
  ) {
    return this.refundsService.request(request.user!.sub, body);
  }
}

@Controller('admin/refunds')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(
  AdminRole.OWNER,
  AdminRole.OPERATOR,
  AdminRole.SUPPORT,
  AdminRole.AUDITOR,
)
export class AdminRefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Get()
  list() {
    return this.refundsService.listAdmin();
  }

  @Post(':id/review')
  @Roles(AdminRole.OWNER, AdminRole.OPERATOR)
  review(
    @Req() request: AdminAuthenticatedRequest,
    @Param('id') id: string,
    @Body()
    body: {
      decision?: RefundReviewDecision;
      confirm?: boolean;
    },
  ) {
    return this.refundsService.review(
      request.user!.sub,
      id,
      body.decision as RefundReviewDecision,
      body.confirm === true,
    );
  }

  @Post(':id/complete-test')
  @Roles(AdminRole.OWNER, AdminRole.OPERATOR)
  completeTest(
    @Req() request: AdminAuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { confirm?: boolean },
  ) {
    return this.refundsService.completeTestRefund(
      request.user!.sub,
      id,
      body.confirm === true,
    );
  }
}
