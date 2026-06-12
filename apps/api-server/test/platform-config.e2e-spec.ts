import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { argon2id, hash } from 'argon2';
import request from 'supertest';

import { AdminLoginThrottleService } from '../src/auth/admin-login-throttle.service.js';
import { ContentPolicyService } from '../src/compliance/content-policy.service.js';
import { configureTrustedProxy } from '../src/common/http/configure-trusted-proxy.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import {
  AdminRole,
  AdminUserStatus,
} from '../src/generated/prisma/client.js';

describe('provider, model and compliance configuration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let throttle: AdminLoginThrottleService;
  let contentPolicy: ContentPolicyService;
  const runId = randomUUID();
  const username = `task5-owner-${runId}`;
  const password = `Local-only-${runId}`;
  const loginIp = '198.51.100.201';
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
  let providerId: string | undefined;
  let modelId: string | undefined;
  let ruleId: string | undefined;
  let accessToken: string;

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
    configureTrustedProxy(app, 1);
    await app.init();
    prisma = app.get(PrismaService);
    throttle = app.get(AdminLoginThrottleService);
    contentPolicy = app.get(ContentPolicyService);

    const admin = await prisma.adminUser.create({
      data: {
        username,
        displayName: 'Task 5 Owner',
        passwordHash: await hash(password, { type: argon2id }),
        role: AdminRole.OWNER,
        status: AdminUserStatus.ACTIVE,
      },
    });
    adminId = admin.id;

    const login = await request(app.getHttpServer())
      .post('/admin/auth/login')
      .set('X-Forwarded-For', loginIp)
      .send({ username, password })
      .expect(201);
    accessToken = login.body.accessToken as string;
  });

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.contentPolicyEvent.deleteMany({
          where: { requestId: { startsWith: `task5-${runId}` } },
        });
        if (ruleId) {
          await prisma.contentPolicyRule.deleteMany({
            where: { id: ruleId },
          });
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
          await prisma.provider.deleteMany({ where: { id: providerId } });
        }
        await prisma.complianceProfile.deleteMany({
          where: { profileKey: 'default', updatedByAdminId: adminId },
        });
        if (adminId) {
          await prisma.adminUser.deleteMany({ where: { id: adminId } });
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

  it('manages safe provider, model, compliance and content policy configuration', async () => {
    await request(app.getHttpServer())
      .post('/admin/providers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: `provider-${runId}`,
        displayName: '测试模型供应商',
        configRef: 'env:UPSTREAM_API_KEY',
        disclosurePurpose: '用于模型推理',
        region: '中国大陆',
        apiKey: 'must-not-be-accepted',
      })
      .expect(400);

    const providerResponse = await request(app.getHttpServer())
      .post('/admin/providers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: `provider-${runId}`,
        displayName: '测试模型供应商',
        configRef: 'env:UPSTREAM_API_KEY',
        disclosurePurpose: '用于模型推理',
        region: '中国大陆',
        routingPriority: 10,
      })
      .expect(201);
    providerId = providerResponse.body.id as string;

    const modelResponse = await request(app.getHttpServer())
      .post('/admin/models')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        providerId,
        name: `model-${runId}`,
        upstreamModel: `upstream-${runId}`,
        displayName: '开发测试模型',
        description: '用于本地端到端测试',
        capabilities: ['chat', 'stream'],
        contextWindow: 8192,
        inputMultiplier: 1,
        outputMultiplier: 2,
        routingPriority: 10,
        status: 'AVAILABLE',
      })
      .expect(201);
    modelId = modelResponse.body.id as string;

    await request(app.getHttpServer())
      .put('/admin/compliance')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        operatorName: '测试经营主体',
        customerServiceContact: '在线客服',
        complaintChannel: '投诉表单',
        serverRegion: '中国大陆',
        logRetentionDays: 30,
        businessDataRetentionDays: 7,
        dataExportMethod: '用户中心申请导出',
        dataDeletionMethod: '用户中心申请删除',
        accountCancellationMethod: '用户中心申请注销',
        privacyPolicyUrl: 'https://example.test/privacy',
        termsOfServiceUrl: 'https://example.test/terms',
        contentSafetyRulesUrl: 'https://example.test/safety',
      })
      .expect(200);

    const ruleResponse = await request(app.getHttpServer())
      .post('/admin/compliance/rules')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: '测试诈骗规则',
        category: 'FRAUD',
        matchType: 'KEYWORD',
        pattern: `测试禁词-${runId}`,
        action: 'BLOCK',
      })
      .expect(201);
    ruleId = ruleResponse.body.id as string;

    await request(app.getHttpServer())
      .post('/admin/compliance/enable-production')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201)
      .expect(({ body }) => {
        expect(body.productionEnabled).toBe(true);
      });

    const publicModels = await request(app.getHttpServer())
      .get('/public/models')
      .expect(200);
    const serializedModels = JSON.stringify(publicModels.body);
    expect(publicModels.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: modelId,
          name: `model-${runId}`,
          status: 'AVAILABLE',
          capabilities: ['chat', 'stream'],
        }),
      ]),
    );
    expect(serializedModels).not.toContain(`upstream-${runId}`);
    expect(serializedModels).not.toContain('env:UPSTREAM_API_KEY');

    await request(app.getHttpServer())
      .get('/public/compliance')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          operatorName: '测试经营主体',
          productionEnabled: true,
          providers: [
            expect.objectContaining({
              name: '测试模型供应商',
              purpose: '用于模型推理',
              region: '中国大陆',
            }),
          ],
        });
      });

    await request(app.getHttpServer())
      .get('/public/compliance/rules')
      .expect(200)
      .expect([
        {
          name: '测试诈骗规则',
          category: 'FRAUD',
          action: 'BLOCK',
        },
      ]);

    const privateInput = `包含测试禁词-${runId}的私人正文`;
    const inspection = await contentPolicy.inspect(
      privateInput,
      `task5-${runId}-policy`,
    );
    expect(inspection).toMatchObject({
      allowed: false,
      ruleId,
      category: 'FRAUD',
    });
    const event = await prisma.contentPolicyEvent.findFirstOrThrow({
      where: { requestId: `task5-${runId}-policy` },
    });
    expect(JSON.stringify(event)).not.toContain(privateInput);

    await request(app.getHttpServer())
      .patch(`/admin/models/${modelId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ description: '修改后需要重新确认生产模式' })
      .expect(200);
    await expect(
      prisma.complianceProfile.findUniqueOrThrow({
        where: { profileKey: 'default' },
      }),
    ).resolves.toMatchObject({ productionEnabled: false });
  });
});
