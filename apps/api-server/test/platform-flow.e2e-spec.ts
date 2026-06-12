import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AdminLoginThrottleService } from '../src/auth/admin-login-throttle.service.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import {
  FulfillmentType,
  UsageLedgerType,
  UserPlanStatus,
} from '../src/generated/prisma/client.js';
import {
  PHASE_ONE_SEED,
  grantPhaseOneTestPlan,
  removePhaseOneSeed,
  seedPhaseOne,
} from '../prisma/seed.js';

describe('phase one platform flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let throttle: AdminLoginThrottleService;
  const runId = randomUUID();
  const loginIp = '198.51.100.210';
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
    TRUST_PROXY_HOPS: '0',
    GATEWAY_IP_RATE_LIMIT_PER_MINUTE: '100',
    GATEWAY_USER_RATE_LIMIT_PER_MINUTE: '100',
    GATEWAY_KEY_RATE_LIMIT_PER_MINUTE: '100',
    UPSTREAM_BASE_URL: 'http://127.0.0.1:4010/v1',
    PAYMENT_DRIVER: 'test',
  } as const;
  const originalEnvironment = new Map<string, string | undefined>();
  let adminToken: string;
  let userToken: string;
  let modelId: string | undefined;
  let planId: string | undefined;
  let userPlanId: string | undefined;
  let apiKeyId: string | undefined;
  let orderId: string | undefined;

  beforeAll(async () => {
    for (const [key, value] of Object.entries(environmentDefaults)) {
      originalEnvironment.set(key, process.env[key]);
      process.env[key] ??= value;
    }

    const { AppModule } = await import('../src/app.module.js');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication({ logger: false });
    await app.init();
    prisma = app.get(PrismaService);
    throttle = app.get(AdminLoginThrottleService);

    await removePhaseOneSeed(prisma);
    await seedPhaseOne(prisma);

    const login = await request(app.getHttpServer())
      .post('/admin/auth/login')
      .send({
        username: PHASE_ONE_SEED.admin.username,
        password: PHASE_ONE_SEED.admin.password,
      })
      .expect(201);
    adminToken = login.body.accessToken as string;
    userToken = await app.get(JwtService).signAsync(
      { sub: PHASE_ONE_SEED.user.id, type: 'user' },
      { audience: 'miniapp' },
    );
  }, 30_000);

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.usageLedger.deleteMany({
          where: { userId: PHASE_ONE_SEED.user.id },
        });
        await prisma.apiCall.deleteMany({
          where: { userId: PHASE_ONE_SEED.user.id },
        });
        if (apiKeyId) {
          await prisma.apiKey.deleteMany({ where: { id: apiKeyId } });
        }
        if (userPlanId) {
          await prisma.userPlan.deleteMany({
            where: { id: userPlanId },
          });
        }
        if (orderId) {
          await prisma.order.deleteMany({ where: { id: orderId } });
        }
        if (planId) {
          await prisma.plan.update({
            where: { id: planId },
            data: { models: { set: [] } },
          });
          await prisma.plan.deleteMany({ where: { id: planId } });
        }
        if (modelId) {
          await prisma.model.deleteMany({ where: { id: modelId } });
        }
        await prisma.auditLog.deleteMany({
          where: { adminUserId: PHASE_ONE_SEED.admin.id },
        });
        await removePhaseOneSeed(prisma);
      }
      if (throttle) {
        await throttle.clearIdentity(
          PHASE_ONE_SEED.admin.username,
          loginIp,
        );
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
  }, 30_000);

  it('runs configuration, grant, API key, gateway, usage, order and audit flows', async () => {
    const model = await request(app.getHttpServer())
      .post('/admin/models')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        providerId: PHASE_ONE_SEED.provider.id,
        name: `phase-one-model-${runId}`,
        upstreamModel: `phase-one-upstream-${runId}`,
        displayName: '阶段一流程测试模型',
        description: '仅用于本地阶段一端到端验收',
        capabilities: ['chat'],
        contextWindow: 8192,
        inputMultiplier: 1,
        outputMultiplier: 1,
        routingPriority: 20,
        status: 'AVAILABLE',
      })
      .expect(201);
    modelId = model.body.id as string;

    const plan = await request(app.getHttpServer())
      .post('/admin/plans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `阶段一开发测试套餐-${runId}`,
        description: '仅用于本地阶段一完整流程验收',
        priceMinor: 100,
        currency: 'CNY',
        unifiedQuota: 1000,
        activationMode: 'IMMEDIATE',
        validityDays: 30,
        refundPolicy: '本地测试套餐不涉及真实退款',
        purchaseNotice: '本地测试支付不产生真实扣款',
        status: 'ACTIVE',
        modelIds: [modelId],
      })
      .expect(201);
    planId = plan.body.id as string;

    const granted = await grantPhaseOneTestPlan(prisma, {
      userId: PHASE_ONE_SEED.user.id,
      planId,
      quota: 1000,
    });
    userPlanId = granted.id;
    expect(granted).toMatchObject({
      fulfillmentType: FulfillmentType.ADMIN_GRANT,
      status: UserPlanStatus.ACTIVE,
      remainingUnifiedQuota: 1000n,
    });

    const key = await request(app.getHttpServer())
      .post('/me/api-keys')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: '阶段一流程测试 Key' })
      .expect(201);
    apiKeyId = key.body.id as string;
    const plaintext = key.body.plaintext as string;

    const prompt = '阶段一验收';
    const completion = await request(app.getHttpServer())
      .post('/v1/chat/completions')
      .set('Authorization', `Bearer ${plaintext}`)
      .send({
        model: `phase-one-model-${runId}`,
        messages: [{ role: 'user', content: prompt }],
      })
      .expect(200);
    expect(completion.body.choices[0].message.content).toBe(
      `测试响应：${prompt}`,
    );

    const summary = await request(app.getHttpServer())
      .get('/me/usage/summary')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    expect(summary.body).toMatchObject({
      callCount: 1,
      inputCharacters: 5,
      outputCharacters: 10,
      chargedUnits: 15,
      remainingUnits: 985,
    });

    const calls = await request(app.getHttpServer())
      .get('/me/api-calls?page=1&pageSize=10')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    expect(calls.body).toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          requestId: completion.headers['x-request-id'],
          modelName: `phase-one-model-${runId}`,
          apiKeyLabel: '阶段一流程测试 Key',
          inputCharacters: 5,
          outputCharacters: 10,
          chargedUnits: 15,
          httpStatus: 200,
        }),
      ],
    });
    expect(JSON.stringify(calls.body)).not.toContain(plaintext);

    const ledger = await prisma.usageLedger.findFirstOrThrow({
      where: {
        userPlanId,
        type: UsageLedgerType.CONSUME,
      },
    });
    expect(ledger.remainingUnified).toBe(985n);

    const order = await request(app.getHttpServer())
      .post('/me/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        planId,
        idempotencyKey: `phase-one-order-${runId}`,
      })
      .expect(201);
    orderId = order.body.id as string;

    await request(app.getHttpServer())
      .get('/admin/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: orderId,
              status: 'PENDING_PAYMENT',
              planId,
              userId: PHASE_ONE_SEED.user.id,
            }),
          ]),
        );
      });

    const audits = await prisma.auditLog.findMany({
      where: {
        adminUserId: PHASE_ONE_SEED.admin.id,
        action: { in: ['MODEL_CREATED', 'PLAN_CREATED'] },
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits.map((audit) => audit.action)).toEqual([
      'MODEL_CREATED',
      'PLAN_CREATED',
    ]);
    expect(audits.map((audit) => audit.afterSummary)).toEqual([
      expect.objectContaining({ id: modelId }),
      expect.objectContaining({ id: planId }),
    ]);
    expect(JSON.stringify(audits)).not.toContain(plaintext);
  });
});
