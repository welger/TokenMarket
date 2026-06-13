import { Body, Controller, Post, Req } from '@nestjs/common';

import {
  WechatAuthService,
  type WechatLoginResult,
} from './wechat-auth.service.js';
import { WechatLoginThrottleService } from './wechat-login-throttle.service.js';

interface WechatLoginBody {
  code?: unknown;
}

interface WechatLoginRequest {
  ip: string;
}

@Controller('auth/wechat')
export class WechatAuthController {
  constructor(
    private readonly wechatAuthService: WechatAuthService,
    private readonly throttle: WechatLoginThrottleService,
  ) {}

  @Post('login')
  async login(
    @Body() body: WechatLoginBody,
    @Req() request: WechatLoginRequest,
  ): Promise<WechatLoginResult> {
    await this.throttle.check(request.ip);
    return this.wechatAuthService.login(body?.code);
  }
}
