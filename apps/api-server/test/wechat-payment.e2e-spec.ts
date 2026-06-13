import {
  createCipheriv,
  createSign,
  generateKeyPairSync,
  randomUUID,
} from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { jest } from '@jest/globals';
import request from 'supertest';

import { PrismaService } from '../src/common/prisma/prisma.service.js';
import {
  OrderStatus,
  PaymentDriver,
  PlanActivationMode,
  PlanStatus,
  UserStatus,
} from '../src/generated/prisma/client.js';
import { RedisService } from '../src/risk/redis.service.js';

jest.setTimeout(30_000);

const redisStub: Pick<RedisService, 'eval' | 'rPush'> = {
  async eval() {
    return [1, 1, 1, 0];
  },
  async rPush() {
    return 1;
  },
};

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

describe('WeChat payment notification (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  let planId: string;
  let orderId: string;
  let orderNumber: string;
  let userToken: string;
  const runId = randomUUID();
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
  const secretDir = mkdtempSync(join(tmpdir(), 'wechat-payment-e2e-'));
  const merchantPrivateKeyPath = join(secretDir, 'merchant.pem');
  const platformCertPath = join(secretDir, 'platform.pem');
  const environmentDefaults = {
    NODE_ENV: 'test',
    DATABASE_URL:
      'postgresql://gateway:gateway_local@127.0.0.1:5432/gateway',
    REDIS_URL: 'redis://127.0.0.1:6379',
    JWT_ACCESS_SECRET: 'jwt-test-secret-not-for-production-123456',
    API_KEY_PEPPER: 'api-key-test-pepper-not-for-production-123',
    AUDIT_IP_HASH_SECRET:
      'audit-ip-test-secret-not-for-production-123',
    ADMIN_LOGIN_THROTTLE_SECRET:
      'login-throttle-test-secret-not-for-production',
    TRUST_PROXY_CIDRS: 'loopback',
    UPSTREAM_BASE_URL: 'http://127.0.0.1:4010/v1',
  } as const;
  const environmentOverrides = {
    PAYMENT_DRIVER: 'wechat',
    WECHAT_APP_ID: 'wx-test-app',
    WECHAT_PAY_MCH_ID: '1900000001',
    WECHAT_PAY_SERIAL_NO: 'merchant-serial',
    WECHAT_PAY_PRIVATE_KEY_PATH: merchantPrivateKeyPath,
    WECHAT_PAY_PLATFORM_CERT_PATH: platformCertPath,
    WECHAT_PAY_API_V3_KEY: apiV3Key,
    WECHAT_PAY_NOTIFY_URL:
      'https://api.example.test/payments/wechat/notify',
  } as const;
  const originalEnvironment = new Map<string, string | undefined>();

  beforeAll(async () => {
    writeFileSync(merchantPrivateKeyPath, privateKeyPem, 'utf8');
    writeFileSync(platformCertPath, publicKeyPem, 'utf8');
    for (const [key, value] of Object.entries(environmentDefaults)) {
      originalEnvironment.set(key, process.env[key]);
      process.env[key] ??= value;
    }
    for (const [key, value] of Object.entries(environmentOverrides)) {
      originalEnvironment.set(key, process.env[key]);
      process.env[key] = value;
    }

    const { AppModule } = await import('../src/app.module.js');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RedisService)
      .useValue(redisStub)
      .compile();
    app = module.createNestApplication({
      logger: false,
      rawBody: true,
    });
    await app.init();
    prisma = app.get(PrismaService);

    const user = await prisma.user.create({
      data: {
        status: UserStatus.ACTIVE,
        wechatOpenId: `openid-${runId}`,
      },
    });
    userId = user.id;
    const plan = await prisma.plan.create({
      data: {
        name: '微信支付测试套餐',
        description: '仅用于微信支付回调 E2E',
        priceMinor: 100,
        currency: 'CNY',
        unifiedQuota: 1000,
        activationMode: PlanActivationMode.IMMEDIATE,
        validityDays: 30,
        refundPolicy: '测试退款规则',
        purchaseNotice: '测试支付不产生真实扣款',
        status: PlanStatus.ACTIVE,
      },
    });
    planId = plan.id;
    const jwt = app.get(JwtService);
    userToken = await jwt.signAsync(
      { sub: user.id, type: 'user' },
      { audience: 'miniapp' },
    );
  });

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.usageLedger.deleteMany({ where: { userId } });
        await prisma.userPlan.deleteMany({ where: { userId } });
        await prisma.order.deleteMany({ where: { userId } });
        if (planId) {
          await prisma.plan.deleteMany({ where: { id: planId } });
        }
        if (userId) {
          await prisma.user.deleteMany({ where: { id: userId } });
        }
      }
    } finally {
      await app?.close();
      for (const [key, value] of originalEnvironment) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  beforeEach(async () => {
    await prisma.usageLedger.deleteMany({ where: { userId } });
    await prisma.userPlan.deleteMany({ where: { userId } });
    await prisma.order.deleteMany({ where: { userId } });
    const create = await request(app.getHttpServer())
      .post('/me/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ planId, idempotencyKey: randomUUID() })
      .expect(201);
    orderId = create.body.id as string;
    orderNumber = create.body.orderNumber as string;
    expect(create.body.paymentDriver).toBe(PaymentDriver.WECHAT);
  });

  function notificationBody(amountMinor: number) {
    return JSON.stringify({
      id: 'notification_1',
      resource: encryptResource(
        JSON.stringify({
          mchid: '1900000001',
          out_trade_no: orderNumber,
          transaction_id: '4200000001',
          trade_state: 'SUCCESS',
          amount: { total: amountMinor, currency: 'CNY' },
        }),
        apiV3Key,
      ),
    });
  }

  function signedHeaders(body: string) {
    const timestamp = '1710000000';
    const nonce = 'notify-nonce';
    const signature = createSign('RSA-SHA256')
      .update(`${timestamp}\n${nonce}\n${body}\n`)
      .end()
      .sign(privateKeyPem, 'base64');
    return {
      'wechatpay-timestamp': timestamp,
      'wechatpay-nonce': nonce,
      'wechatpay-signature': signature,
      'wechatpay-serial': 'platform-serial',
    };
  }

  it('rejects a callback with an invalid signature', async () => {
    const body = notificationBody(100);

    await request(app.getHttpServer())
      .post('/payments/wechat/notify')
      .set({
        ...signedHeaders(body),
        'wechatpay-signature': 'invalid-signature',
      })
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(401);
  });

  it('rejects a paid amount different from the order amount', async () => {
    const body = notificationBody(1);

    await request(app.getHttpServer())
      .post('/payments/wechat/notify')
      .set(signedHeaders(body))
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(409);
    await expect(
      prisma.userPlan.count({ where: { orderId } }),
    ).resolves.toBe(0);
  });

  it('fulfills a matching payment once and accepts duplicate notifications', async () => {
    const body = notificationBody(100);

    await request(app.getHttpServer())
      .post('/payments/wechat/notify')
      .set(signedHeaders(body))
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(200)
      .expect(({ body: responseBody }) => {
        expect(responseBody).toEqual({ code: 'SUCCESS', message: '成功' });
      });
    await expect(
      prisma.order.findUnique({ where: { id: orderId } }),
    ).resolves.toMatchObject({
      status: OrderStatus.FULFILLED,
      paymentReference: 'wechat:4200000001',
    });
    await expect(
      prisma.userPlan.count({ where: { orderId } }),
    ).resolves.toBe(1);

    await request(app.getHttpServer())
      .post('/payments/wechat/notify')
      .set(signedHeaders(body))
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(200);
    await expect(
      prisma.userPlan.count({ where: { orderId } }),
    ).resolves.toBe(1);
  });
});
