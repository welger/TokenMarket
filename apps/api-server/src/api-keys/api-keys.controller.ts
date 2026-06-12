import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { ApiKeysService } from './api-keys.service.js';
import type { UserAuthenticatedRequest } from '../auth/user-auth.types.js';
import { UserJwtGuard } from '../auth/user-jwt.guard.js';

@Controller('me/api-keys')
@UseGuards(UserJwtGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get()
  list(@Req() request: UserAuthenticatedRequest) {
    return this.apiKeysService.list(request.user!.sub);
  }

  @Post()
  create(
    @Req() request: UserAuthenticatedRequest,
    @Body() body: { name?: unknown },
  ) {
    return this.apiKeysService.create(request.user!.sub, body.name);
  }

  @Post(':id/disable')
  disable(
    @Req() request: UserAuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.apiKeysService.disable(request.user!.sub, id);
  }
}
