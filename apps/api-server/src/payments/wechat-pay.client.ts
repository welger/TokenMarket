import { randomUUID } from 'node:crypto';

import { ConflictException, Injectable } from '@nestjs/common';

import { WechatSignatureService } from './wechat-signature.service.js';

export interface WechatPayClientOptions {
  baseUrl: string;
  appId: string;
  merchantId: string;
  merchantSerialNo: string;
  merchantPrivateKeyPem: string;
  notifyUrl: string;
}

export interface WechatPayTransport {
  postJson(
    url: string,
    body: Record<string, unknown>,
    headers: Record<string, string>,
  ): Promise<unknown>;
}

export interface WechatJsapiPrepayInput {
  description: string;
  orderNumber: string;
  amountMinor: number;
  currency: string;
  payerOpenId: string;
}

export interface WechatJsapiPaymentParams {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: 'RSA';
  paySign: string;
}

export class WechatPayPrepayException extends ConflictException {
  readonly code = 'WECHAT_PAY_PREPAY_FAILED';

  constructor() {
    super({
      code: 'WECHAT_PAY_PREPAY_FAILED',
      message: '微信支付下单失败',
    });
  }
}

export class FetchWechatPayTransport implements WechatPayTransport {
  async postJson(
    url: string,
    body: Record<string, unknown>,
    headers: Record<string, string>,
  ): Promise<unknown> {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new WechatPayPrepayException();
    }
    return payload;
  }
}

@Injectable()
export class WechatPayClient {
  constructor(
    private readonly signatureService: WechatSignatureService,
    private readonly options: WechatPayClientOptions,
    private readonly transport: WechatPayTransport,
    private readonly nowSeconds: () => string = () =>
      Math.floor(Date.now() / 1000).toString(),
    private readonly nonce: () => string = () =>
      randomUUID().replaceAll('-', ''),
  ) {}

  async createJsapiPrepay(
    input: WechatJsapiPrepayInput,
  ): Promise<WechatJsapiPaymentParams> {
    const body = {
      appid: this.options.appId,
      mchid: this.options.merchantId,
      description: input.description,
      out_trade_no: input.orderNumber,
      notify_url: this.options.notifyUrl,
      amount: {
        total: input.amountMinor,
        currency: input.currency,
      },
      payer: {
        openid: input.payerOpenId,
      },
    };
    const bodyText = JSON.stringify(body);
    const timestamp = this.nowSeconds();
    const nonce = this.nonce();
    const authorization =
      this.signatureService.createAuthorizationHeader({
        method: 'POST',
        pathWithQuery: '/v3/pay/transactions/jsapi',
        timestamp,
        nonce,
        body: bodyText,
        merchantId: this.options.merchantId,
        merchantSerialNo: this.options.merchantSerialNo,
        merchantPrivateKeyPem: this.options.merchantPrivateKeyPem,
      });

    const response = await this.transport.postJson(
      `${this.options.baseUrl}/v3/pay/transactions/jsapi`,
      body,
      {
        Accept: 'application/json',
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
    );
    const prepayId = this.extractPrepayId(response);
    const paymentPackage = `prepay_id=${prepayId}`;

    return {
      timeStamp: timestamp,
      nonceStr: nonce,
      package: paymentPackage,
      signType: 'RSA',
      paySign: this.signatureService.sign(
        `${this.options.appId}\n${timestamp}\n${nonce}\n${paymentPackage}\n`,
        this.options.merchantPrivateKeyPem,
      ),
    };
  }

  private extractPrepayId(response: unknown): string {
    if (
      typeof response === 'object' &&
      response !== null &&
      'prepay_id' in response &&
      typeof response.prepay_id === 'string' &&
      response.prepay_id.trim().length > 0
    ) {
      return response.prepay_id;
    }
    throw new WechatPayPrepayException();
  }
}
