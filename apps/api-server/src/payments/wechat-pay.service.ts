import { readFileSync } from 'node:fs';

import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  FetchWechatPayTransport,
  WechatPayClient,
  type WechatJsapiPaymentParams,
  type WechatPayClientOptions,
} from './wechat-pay.client.js';
import {
  WechatSignatureService,
  type WechatEncryptedResource,
} from './wechat-signature.service.js';
import type { EnvironmentVariables } from '../common/config/env.schema.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { OrderStatus, PaymentDriver } from '../generated/prisma/client.js';
import { OrdersService } from '../orders/orders.service.js';

export interface WechatNotificationHeaders {
  timestamp: string;
  nonce: string;
  signature: string;
  serial: string;
}

export interface WechatNotificationResponse {
  code: 'SUCCESS';
  message: '成功';
}

interface WechatNotificationBody {
  resource?: WechatEncryptedResource;
}

interface WechatTransactionResource {
  mchid?: unknown;
  out_trade_no?: unknown;
  transaction_id?: unknown;
  trade_state?: unknown;
  amount?: {
    total?: unknown;
    currency?: unknown;
  };
}

export class WechatPaySignatureInvalidException extends UnauthorizedException {
  readonly code = 'WECHAT_PAY_SIGNATURE_INVALID';

  constructor() {
    super({
      code: 'WECHAT_PAY_SIGNATURE_INVALID',
      message: '微信支付通知签名无效',
    });
  }
}

export class WechatPayMerchantMismatchException extends ConflictException {
  readonly code = 'WECHAT_PAY_MERCHANT_MISMATCH';

  constructor() {
    super({
      code: 'WECHAT_PAY_MERCHANT_MISMATCH',
      message: '微信支付商户号不匹配',
    });
  }
}

export class WechatPayNotificationInvalidException extends ConflictException {
  readonly code = 'WECHAT_PAY_NOTIFICATION_INVALID';

  constructor() {
    super({
      code: 'WECHAT_PAY_NOTIFICATION_INVALID',
      message: '微信支付通知内容无效',
    });
  }
}

@Injectable()
export class WechatPayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly signatureService: WechatSignatureService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
    @Optional()
    private readonly wechatPayClient?: WechatPayClient,
  ) {}

  async createJsapiPayment(
    userId: string,
    orderId: string,
  ): Promise<WechatJsapiPaymentParams> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { plan: true, user: true },
    });
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }
    if (order.paymentDriver !== PaymentDriver.WECHAT) {
      throw new ConflictException('Order is not a WeChat payment');
    }
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new ConflictException('Order cannot be paid');
    }
    if (
      typeof order.user.wechatOpenId !== 'string' ||
      order.user.wechatOpenId.trim().length === 0
    ) {
      throw new ConflictException('WeChat openid is required');
    }

    return this.getClient().createJsapiPrepay({
      description: order.plan.name,
      orderNumber: order.orderNumber,
      amountMinor: order.amountMinor,
      currency: order.currency,
      payerOpenId: order.user.wechatOpenId,
    });
  }

  async handleNotification(
    headers: WechatNotificationHeaders,
    rawBody: string,
  ): Promise<WechatNotificationResponse> {
    const platformPublicKeyPem = this.readRequiredFile(
      'WECHAT_PAY_PLATFORM_CERT_PATH',
    );
    const valid = this.signatureService.verifyNotificationSignature({
      timestamp: headers.timestamp,
      nonce: headers.nonce,
      body: rawBody,
      signature: headers.signature,
      platformPublicKeyPem,
    });
    if (!valid) {
      throw new WechatPaySignatureInvalidException();
    }

    const body = this.parseNotificationBody(rawBody);
    if (!body.resource) {
      throw new WechatPayNotificationInvalidException();
    }
    const decrypted = this.signatureService.decryptResource(
      body.resource,
      this.requiredConfig('WECHAT_PAY_API_V3_KEY'),
    );
    const transaction = this.parseTransactionResource(decrypted);
    const merchantId = this.requiredConfig('WECHAT_PAY_MCH_ID');
    if (transaction.mchid !== merchantId) {
      throw new WechatPayMerchantMismatchException();
    }
    if (transaction.trade_state !== 'SUCCESS') {
      throw new WechatPayNotificationInvalidException();
    }

    await this.ordersService.applyWechatPayment({
      orderNumber: transaction.out_trade_no,
      transactionId: transaction.transaction_id,
      amountMinor: transaction.amount.total,
      currency: transaction.amount.currency,
    });
    return { code: 'SUCCESS', message: '成功' };
  }

  private parseNotificationBody(rawBody: string): WechatNotificationBody {
    try {
      const parsed = JSON.parse(rawBody) as WechatNotificationBody;
      return parsed;
    } catch {
      throw new WechatPayNotificationInvalidException();
    }
  }

  private parseTransactionResource(
    rawResource: string,
  ): Required<WechatTransactionResource> & {
    mchid: string;
    out_trade_no: string;
    transaction_id: string;
    trade_state: string;
    amount: { total: number; currency: string };
  } {
    let parsed: WechatTransactionResource;
    try {
      parsed = JSON.parse(rawResource) as WechatTransactionResource;
    } catch {
      throw new WechatPayNotificationInvalidException();
    }
    if (
      typeof parsed.mchid !== 'string' ||
      typeof parsed.out_trade_no !== 'string' ||
      typeof parsed.transaction_id !== 'string' ||
      typeof parsed.trade_state !== 'string' ||
      typeof parsed.amount?.total !== 'number' ||
      !Number.isInteger(parsed.amount.total) ||
      typeof parsed.amount.currency !== 'string'
    ) {
      throw new WechatPayNotificationInvalidException();
    }
    return {
      mchid: parsed.mchid,
      out_trade_no: parsed.out_trade_no,
      transaction_id: parsed.transaction_id,
      trade_state: parsed.trade_state,
      amount: {
        total: parsed.amount.total,
        currency: parsed.amount.currency,
      },
    };
  }

  private readRequiredFile(key: keyof EnvironmentVariables): string {
    return readFileSync(this.requiredConfig(key), 'utf8');
  }

  private getClient(): WechatPayClient {
    if (this.wechatPayClient) {
      return this.wechatPayClient;
    }
    const options: WechatPayClientOptions = {
      baseUrl: 'https://api.mch.weixin.qq.com',
      appId: this.requiredConfig('WECHAT_APP_ID'),
      merchantId: this.requiredConfig('WECHAT_PAY_MCH_ID'),
      merchantSerialNo: this.requiredConfig('WECHAT_PAY_SERIAL_NO'),
      merchantPrivateKeyPem: this.readRequiredFile(
        'WECHAT_PAY_PRIVATE_KEY_PATH',
      ),
      notifyUrl: this.requiredConfig('WECHAT_PAY_NOTIFY_URL'),
    };
    return new WechatPayClient(
      this.signatureService,
      options,
      new FetchWechatPayTransport(),
    );
  }

  private requiredConfig(key: keyof EnvironmentVariables): string {
    const value = this.config.get(key, { infer: true });
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new WechatPayNotificationInvalidException();
    }
    return value.trim();
  }
}
