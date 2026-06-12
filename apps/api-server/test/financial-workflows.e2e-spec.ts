import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { argon2id, hash } from 'argon2';
import request from 'supertest';

import { AdminLoginThrottleService } from '../src/auth/admin-login-throttle.service.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import {
  AdminRole,
  AdminUserStatus,
  ModelStatus,
  ProviderStatus,
  UserPlanStatus,
  UserStatus,
} from '../src/generated/prisma/client.js';

describe('financial workflows (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let throttle: AdminLoginThrottleService;
  const runId = randomUUID();
  const username = `task6-owner-${runId}`;
  const password = `Local-only-${runId}`;
  const loginIp = '198.51.100.206';
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
    TRUST_PROXY_HOPS: '1',
    UPSTREAM_BASE_URL: 'http://127.0.0.1:4010/v1',
    PAYMENT_DRIVER: 'test',
  } as const;
  const originalEnvironment = new Map<string, string | undefined>();
  let adminId: string | undefined;
  let userId: string | undefined;
  let providerId: string | undefined;
  let modelId: string | undefined;
  let planId: string | undefined;
  const orderIds: string[] = [];
  const refundIds: string[] = [];
  const invoiceIds: string[] = [];
  let adminToken: string;
  let userToken: string;

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

    const admin = await prisma.adminUser.create({
      data: {
        username,
        displayName: 'Task 6 Owner',
        passwordHash: await hash(password, { type: argon2id }),
        role: AdminRole.OWNER,
        status: AdminUserStatus.ACTIVE,
      },
    });
    adminId = admin.id;
    const user = await prisma.user.create({
      data: { status: UserStatus.ACTIVE },
    });
    userId = user.id;
    const provider = await prisma.provider.create({
      data: {
        name: `task6-provider-${runId}`,
        displayName: '本地测试供应商',
        configRef: `env:TASK6_${runId.replaceAll('-', '_').toUpperCase()}`,
        disclosurePurpose: '本地端到端测试',
        region: '本地测试环境',
        status: ProviderStatus.ACTIVE,
      },
    });
    providerId = provider.id;
    const model = await prisma.model.create({
      data: {
        providerId: provider.id,
        name: `task6-model-${runId}`,
        upstreamModel: `task6-upstream-${runId}`,
        displayName: '本地测试模型',
        description: '仅用于本地端到端测试',
        contextWindow: 8192,
        status: ModelStatus.AVAILABLE,
      },
    });
    modelId = model.id;

    const login = await request(app.getHttpServer())
      .post('/admin/auth/login')
      .set('X-Forwarded-For', loginIp)
      .send({ username, password })
      .expect(201);
    adminToken = login.body.accessToken as string;

    const jwt = app.get(JwtService);
    userToken = await jwt.signAsync(
      { sub: user.id, type: 'user' },
      { audience: 'miniapp' },
    );
  });

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.invoiceOrder.deleteMany({
          where: { invoiceId: { in: invoiceIds } },
        });
        await prisma.invoice.deleteMany({
          where: { id: { in: invoiceIds } },
        });
        await prisma.refund.deleteMany({
          where: { id: { in: refundIds } },
        });
        await prisma.usageLedger.deleteMany({
          where: { userId },
        });
        await prisma.userPlan.deleteMany({ where: { userId } });
        await prisma.order.deleteMany({
          where: { id: { in: orderIds } },
        });
        if (planId) {
          await prisma.plan.update({
            where: { id: planId },
            data: { models: { set: [] } },
          });
          await prisma.plan.deleteMany({ where: { id: planId } });
        }
        if (adminId) {
          await prisma.auditLog.deleteMany({
            where: { adminUserId: adminId },
          });
        }
        if (modelId) {
          await prisma.model.deleteMany({ where: { id: modelId } });
        }
        if (providerId) {
          await prisma.provider.deleteMany({
            where: { id: providerId },
          });
        }
        if (userId) {
          await prisma.user.deleteMany({ where: { id: userId } });
        }
        if (adminId) {
          await prisma.adminUser.deleteMany({
            where: { id: adminId },
          });
        }
      }
      if (throttle) {
        await throttle.clearIdentity(username, loginIp);
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

  it('runs test payment, invoice review and test refund without pretending real services', async () => {
    const planResponse = await request(app.getHttpServer())
      .post('/admin/plans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: '开发测试套餐',
        description: '仅用于本地测试支付',
        priceMinor: 100,
        currency: 'CNY',
        unifiedQuota: 1000000,
        activationMode: 'IMMEDIATE',
        validityDays: 30,
        refundPolicy: '未使用额度可提交全额退款申请',
        purchaseNotice: '测试支付不产生真实扣款',
        status: 'ACTIVE',
        modelIds: [modelId],
      })
      .expect(201);
    planId = planResponse.body.id as string;

    await request(app.getHttpServer())
      .get('/public/plans')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: planId,
              unifiedQuota: 1000000,
              applicableModelIds: [modelId],
            }),
          ]),
        );
      });

    const createAndPay = async (key: string) => {
      const create = await request(app.getHttpServer())
        .post('/me/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ planId, idempotencyKey: key })
        .expect(201);
      orderIds.push(create.body.id as string);

      await request(app.getHttpServer())
        .post('/me/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ planId, idempotencyKey: key })
        .expect(201)
        .expect(({ body }) => {
          expect(body.id).toBe(create.body.id);
        });

      await request(app.getHttpServer())
        .post(`/me/orders/${create.body.id}/pay-test`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(201)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            order: { status: 'FULFILLED' },
            paymentLabel: '测试支付',
          });
        });
      return create.body.id as string;
    };

    const invoiceOrderId = await createAndPay(`invoice-${runId}`);
    const refundOrderId = await createAndPay(`refund-${runId}`);

    const invoice = await request(app.getHttpServer())
      .post('/me/invoices')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        orderIds: [invoiceOrderId],
        title: '本地测试抬头',
      })
      .expect(201);
    invoiceIds.push(invoice.body.id as string);

    await request(app.getHttpServer())
      .post(`/admin/invoices/${invoice.body.id}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'APPROVE', confirm: true })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('APPROVED');
      });
    await request(app.getHttpServer())
      .post(`/admin/invoices/${invoice.body.id}/issue`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe('INVOICE_DRIVER_UNAVAILABLE');
      });

    const refund = await request(app.getHttpServer())
      .post('/me/refunds')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        orderId: refundOrderId,
        amountMinor: 100,
        reason: '本地测试退款',
      })
      .expect(201);
    refundIds.push(refund.body.id as string);

    await request(app.getHttpServer())
      .post(`/admin/refunds/${refund.body.id}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'APPROVE', confirm: true })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('APPROVED');
      });
    await request(app.getHttpServer())
      .post(`/admin/refunds/${refund.body.id}/complete-test`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ confirm: true })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('REFUNDED');
      });

    const refundedPlan = await prisma.userPlan.findFirstOrThrow({
      where: {
        orderId: refundOrderId,
        userId,
      },
    });
    expect(refundedPlan.status).toBe(UserPlanStatus.CANCELLED);
  });
});
