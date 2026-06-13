import { createCipheriv, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ConfigService } from '@nestjs/config';
import { jest } from '@jest/globals';

import { WechatPayService } from './wechat-pay.service.js';
import type { WechatPayClient } from './wechat-pay.client.js';
import { WechatSignatureService } from './wechat-signature.service.js';
import type { EnvironmentVariables } from '../common/config/env.schema.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import { OrderStatus, PaymentDriver } from '../generated/prisma/client.js';
import type { OrdersService } from '../orders/orders.service.js';

function encryptResource(plaintext: string, apiV3Key: string) {
  const nonce = 'notify-nonce';
  const associatedData = 'transaction';
  const cipher = createCipheriv(
    'aes-256-gcm',
    Buffer.from(apiV3Key, 'utf8'),
    Buffer.from(nonce, 'utf8'),
  );
  cipher.setAAD(Buffer.from(associatedData, 'utf8'));
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    associated_data: associatedData,
    nonce,
    ciphertext: Buffer.concat([encrypted, authTag]).toString('base64'),
  };
}

describe('WechatPayService', () => {
  const apiV3Key = 'a'.repeat(32);
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const privateKeyPem = privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  }) as string;
  const publicKeyPem = publicKey.export({
    type: 'spki',
    format: 'pem',
  }) as string;
  const certPath = join(
    mkdtempSync(join(tmpdir(), 'wechat-pay-service-')),
    'platform.pem',
  );
  writeFileSync(certPath, publicKeyPem, 'utf8');

  function createHarness() {
    const signatureService = new WechatSignatureService();
    const ordersService = {
      applyWechatPayment: jest.fn().mockResolvedValue({
        order: { id: 'order_1' },
        userPlan: { id: 'user_plan_1' },
        paymentLabel: '微信支付',
      }),
    } as unknown as OrdersService;
    const config = {
      get: jest.fn((key: keyof EnvironmentVariables) => {
        const values: Partial<EnvironmentVariables> = {
          WECHAT_PAY_MCH_ID: '1900000001',
          WECHAT_PAY_API_V3_KEY: apiV3Key,
          WECHAT_PAY_PLATFORM_CERT_PATH: certPath,
        };
        return values[key];
      }),
    } as unknown as ConfigService<EnvironmentVariables, true>;
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order_1',
          orderNumber: 'ord_1',
          userId: 'user_1',
          amountMinor: 100,
          currency: 'CNY',
          status: OrderStatus.PENDING_PAYMENT,
          paymentDriver: PaymentDriver.WECHAT,
          plan: { name: '开发测试套餐' },
          user: { wechatOpenId: 'openid_1' },
        }),
      },
    } as unknown as PrismaService;
    const client = {
      createJsapiPrepay: jest.fn().mockResolvedValue({
        timeStamp: '1710000000',
        nonceStr: 'nonce-123',
        package: 'prepay_id=wx-prepay-1',
        signType: 'RSA',
        paySign: 'pay-sign',
      }),
    } as unknown as WechatPayClient;
    const service = new WechatPayService(
      prisma,
      ordersService,
      signatureService,
      config,
      client,
    );

    return { service, ordersService, signatureService, prisma, client };
  }

  function signedNotification(
    signatureService: WechatSignatureService,
    body: string,
  ) {
    const timestamp = '1710000000';
    const nonce = 'notify-nonce';
    return {
      timestamp,
      nonce,
      signature: signatureService.sign(
        `${timestamp}\n${nonce}\n${body}\n`,
        privateKeyPem,
      ),
      serial: 'platform-serial',
    };
  }

  it('rejects a notification with an invalid signature', async () => {
    const { service } = createHarness();

    await expect(
      service.handleNotification(
        {
          timestamp: '1710000000',
          nonce: 'notify-nonce',
          signature: 'invalid-signature',
          serial: 'platform-serial',
        },
        '{"id":"notification_1"}',
      ),
    ).rejects.toMatchObject({ code: 'WECHAT_PAY_SIGNATURE_INVALID' });
  });

  it('decrypts a successful notification and applies the payment', async () => {
    const { service, ordersService, signatureService } = createHarness();
    const resource = encryptResource(
      JSON.stringify({
        mchid: '1900000001',
        out_trade_no: 'ord_1',
        transaction_id: '4200000001',
        trade_state: 'SUCCESS',
        amount: { total: 100, currency: 'CNY' },
      }),
      apiV3Key,
    );
    const body = JSON.stringify({ id: 'notification_1', resource });

    await expect(
      service.handleNotification(
        signedNotification(signatureService, body),
        body,
      ),
    ).resolves.toEqual({ code: 'SUCCESS', message: '成功' });
    expect(ordersService.applyWechatPayment).toHaveBeenCalledWith({
      orderNumber: 'ord_1',
      transactionId: '4200000001',
      amountMinor: 100,
      currency: 'CNY',
    });
  });

  it('rejects notifications for another merchant', async () => {
    const { service, signatureService } = createHarness();
    const resource = encryptResource(
      JSON.stringify({
        mchid: 'another-merchant',
        out_trade_no: 'ord_1',
        transaction_id: '4200000001',
        trade_state: 'SUCCESS',
        amount: { total: 100, currency: 'CNY' },
      }),
      apiV3Key,
    );
    const body = JSON.stringify({ id: 'notification_1', resource });

    await expect(
      service.handleNotification(
        signedNotification(signatureService, body),
        body,
      ),
    ).rejects.toMatchObject({ code: 'WECHAT_PAY_MERCHANT_MISMATCH' });
  });

  it('creates JSAPI payment params from the server-side order and user openid', async () => {
    const { service, client } = createHarness();

    await expect(
      service.createJsapiPayment('user_1', 'order_1'),
    ).resolves.toMatchObject({
      package: 'prepay_id=wx-prepay-1',
      signType: 'RSA',
    });
    expect(client.createJsapiPrepay).toHaveBeenCalledWith({
      description: '开发测试套餐',
      orderNumber: 'ord_1',
      amountMinor: 100,
      currency: 'CNY',
      payerOpenId: 'openid_1',
    });
  });

  it('rejects JSAPI payment when the order is not owned by the user', async () => {
    const { service, prisma } = createHarness();
    prisma.order.findUnique = jest.fn().mockResolvedValue({
      id: 'order_1',
      userId: 'other_user',
      status: OrderStatus.PENDING_PAYMENT,
      paymentDriver: PaymentDriver.WECHAT,
      plan: { name: '开发测试套餐' },
      user: { wechatOpenId: 'openid_1' },
    });

    await expect(
      service.createJsapiPayment('user_1', 'order_1'),
    ).rejects.toThrow('Order not found');
  });
});
