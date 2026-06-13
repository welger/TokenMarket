import { generateKeyPairSync } from 'node:crypto';

import { jest } from '@jest/globals';

import {
  WechatPayClient,
  type WechatPayTransport,
} from './wechat-pay.client.js';
import { WechatSignatureService } from './wechat-signature.service.js';

describe('WechatPayClient', () => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const privateKeyPem = privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  }) as string;

  it('creates a JSAPI prepay request from server-side order data', async () => {
    const transport = {
      postJson: jest.fn().mockResolvedValue({
        prepay_id: 'wx-prepay-1',
      }),
    } satisfies WechatPayTransport;
    const client = new WechatPayClient(
      new WechatSignatureService(),
      {
        baseUrl: 'https://api.mch.weixin.qq.com',
        appId: 'wx-app-id',
        merchantId: '1900000001',
        merchantSerialNo: 'serial-123',
        merchantPrivateKeyPem: privateKeyPem,
        notifyUrl: 'https://api.example.test/payments/wechat/notify',
      },
      transport,
      () => '1710000000',
      () => 'nonce-123',
    );

    const result = await client.createJsapiPrepay({
      description: '开发测试套餐',
      orderNumber: 'ord_1',
      amountMinor: 100,
      currency: 'CNY',
      payerOpenId: 'openid_1',
    });

    expect(transport.postJson).toHaveBeenCalledWith(
      'https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi',
      expect.objectContaining({
        appid: 'wx-app-id',
        mchid: '1900000001',
        description: '开发测试套餐',
        out_trade_no: 'ord_1',
        notify_url: 'https://api.example.test/payments/wechat/notify',
        amount: { total: 100, currency: 'CNY' },
        payer: { openid: 'openid_1' },
      }),
      expect.objectContaining({
        Authorization: expect.stringContaining(
          'WECHATPAY2-SHA256-RSA2048',
        ),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      }),
    );
    expect(result).toMatchObject({
      timeStamp: '1710000000',
      nonceStr: 'nonce-123',
      package: 'prepay_id=wx-prepay-1',
      signType: 'RSA',
    });
    expect(result.paySign).toEqual(expect.any(String));
  });

  it('rejects a prepay response without prepay_id', async () => {
    const transport = {
      postJson: jest.fn().mockResolvedValue({}),
    } satisfies WechatPayTransport;
    const client = new WechatPayClient(
      new WechatSignatureService(),
      {
        baseUrl: 'https://api.mch.weixin.qq.com',
        appId: 'wx-app-id',
        merchantId: '1900000001',
        merchantSerialNo: 'serial-123',
        merchantPrivateKeyPem: privateKeyPem,
        notifyUrl: 'https://api.example.test/payments/wechat/notify',
      },
      transport,
      () => '1710000000',
      () => 'nonce-123',
    );

    await expect(
      client.createJsapiPrepay({
        description: '开发测试套餐',
        orderNumber: 'ord_1',
        amountMinor: 100,
        currency: 'CNY',
        payerOpenId: 'openid_1',
      }),
    ).rejects.toMatchObject({
      code: 'WECHAT_PAY_PREPAY_FAILED',
    });
  });
});
