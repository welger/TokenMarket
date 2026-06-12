import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { UsageService } from './usage.service.js';
import type { UserAuthenticatedRequest } from '../auth/user-auth.types.js';
import { UserJwtGuard } from '../auth/user-jwt.guard.js';
import { toJsonSafe } from '../common/http/json-safe.js';

@Controller('me')
@UseGuards(UserJwtGuard)
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  @Get('usage/summary')
  async summary(@Req() request: UserAuthenticatedRequest) {
    return toJsonSafe(
      await this.usageService.summary(request.user!.sub),
    );
  }

  @Get('api-calls')
  async apiCalls(
    @Req() request: UserAuthenticatedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return toJsonSafe(
      await this.usageService.apiCalls(
        request.user!.sub,
        page,
        pageSize,
      ),
    );
  }

  @Get('plans')
  async plans(
    @Req() request: UserAuthenticatedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return toJsonSafe(
      await this.usageService.plans(
        request.user!.sub,
        page,
        pageSize,
      ),
    );
  }
}
