import { Body, Controller, Post, Req } from '@nestjs/common';

import {
  AdminAuthService,
  type AdminLoginResult,
} from './admin-auth.service.js';

interface AdminLoginBody {
  username?: unknown;
  password?: unknown;
}

interface LoginRequest {
  ip: string;
}

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  login(
    @Body() body: AdminLoginBody,
    @Req() request: LoginRequest,
  ): Promise<AdminLoginResult> {
    return this.adminAuthService.login(
      body?.username,
      body?.password,
      request.ip,
    );
  }
}
