import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { WechatPayService } from './wechat-pay.service.js';
import type { UserAuthenticatedRequest } from '../auth/user-auth.types.js';
import { UserJwtGuard } from '../auth/user-jwt.guard.js';
import { toJsonSafe } from '../common/http/json-safe.js';

interface RawBodyRequest {
  rawBody?: Buffer;
}

@Controller('payments/wechat')
export class WechatPayController {
  constructor(private readonly wechatPayService: WechatPayService) {}

  @Post('notify')
  @HttpCode(200)
  notify(
    @Headers('wechatpay-timestamp') timestamp: string,
    @Headers('wechatpay-nonce') nonce: string,
    @Headers('wechatpay-signature') signature: string,
    @Headers('wechatpay-serial') serial: string,
    @Body() body: unknown,
    @Req() request: RawBodyRequest,
  ) {
    const rawBody =
      request.rawBody?.toString('utf8') ?? JSON.stringify(body);
    return this.wechatPayService.handleNotification(
      { timestamp, nonce, signature, serial },
      rawBody,
    );
  }
}

@Controller('me/orders')
@UseGuards(UserJwtGuard)
export class UserWechatPayController {
  constructor(private readonly wechatPayService: WechatPayService) {}

  @Post(':id/pay-wechat')
  async payWechat(
    @Req() request: UserAuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return toJsonSafe(
      await this.wechatPayService.createJsapiPayment(
        request.user!.sub,
        id,
      ),
    );
  }
}
