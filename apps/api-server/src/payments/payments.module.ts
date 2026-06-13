import { Module } from '@nestjs/common';

import {
  UserWechatPayController,
  WechatPayController,
} from './wechat-pay.controller.js';
import { WechatPayService } from './wechat-pay.service.js';
import { WechatSignatureService } from './wechat-signature.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { OrdersModule } from '../orders/orders.module.js';

@Module({
  imports: [AuthModule, OrdersModule],
  controllers: [WechatPayController, UserWechatPayController],
  providers: [WechatSignatureService, WechatPayService],
  exports: [WechatSignatureService, WechatPayService],
})
export class PaymentsModule {}
