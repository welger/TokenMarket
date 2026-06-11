import { Body, Controller, Post } from '@nestjs/common';

import {
  AdminAuthService,
  type AdminLoginResult,
} from './admin-auth.service.js';

interface AdminLoginBody {
  username?: unknown;
  password?: unknown;
}

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  login(@Body() body: AdminLoginBody): Promise<AdminLoginResult> {
    return this.adminAuthService.login(body?.username, body?.password);
  }
}
