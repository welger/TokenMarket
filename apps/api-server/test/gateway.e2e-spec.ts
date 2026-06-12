import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { ApiKeysService } from '../src/api-keys/api-keys.service.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import {
  FulfillmentType,
  ModelStatus,
  PlanActivationMode,
  PlanStatus,
  ProviderStatus,
  UserPlanStatus,
  UserStatus,
} from '../src/generated/prisma/client.js';
import { TestProviderClient } from '../src/providers/test-provider.client.js';

describe('model gateway (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let provider: TestProviderClient;
  const runId = randomUUID();
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
    GATEWAY_KEY_RATE_LIMIT_PER_MINUTE: '6',
    UPSTREAM_BASE_URL: 'http://127.0.0.1:4010/v1',
    PAYMENT_DRIVER: 'test',
  } as const;
  const originalEnvironment = new Map<string, string | undefined>();
  let userId: string | undefined;
  let providerId: string | undefined;
  let modelId: string | undefined;
  let planId: string | undefined;
  let userPlanId: string | undefined;
  let apiKeyId: string | undefined;
  let plaintext: string;
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
    await app.init();
    prisma = app.get(PrismaService);
    provider = app.get(TestProviderClient);

    const user = await prisma.user.create({
      data: { status: UserStatus.ACTIVE },
    });
    userId = user.id;
    const upstreamProvider = await prisma.provider.create({
      data: {
        name: `gateway-provider-${runId}`,
        displayName: '网关本地测试供应商',
        configRef: 'env:TEST_PROVIDER',
        disclosurePurpose: '本地网关测试',
        region: '本地测试环境',
        status: ProviderStatus.ACTIVE,
      },
    });
    providerId = upstreamProvider.id;
    const model = await prisma.model.create({
      data: {
        providerId: upstreamProvider.id,
        name: `gateway-model-${runId}`,
        upstreamModel: `upstream-${runId}`,
        displayName: '网关测试模型',
        description: '仅用于本地网关测试',
        contextWindow: 8192,
        inputMultiplier: 1,
        outputMultiplier: 1,
        status: ModelStatus.AVAILABLE,
      },
    });
    modelId = model.id;
    const plan = await prisma.plan.create({
      data: {
        name: `Gateway plan ${runId}`,
        description: 'Local gateway test only',
        priceMinor: 0,
        currency: 'CNY',
        unifiedQuota: 100,
        activationMode: PlanActivationMode.IMMEDIATE,
        validityDays: 30,
        refundPolicy: 'Local test only',
        purchaseNotice: 'Local test only',
        status: PlanStatus.ACTIVE,
        models: { connect: { id: model.id } },
      },
    });
    planId = plan.id;
    const userPlan = await prisma.userPlan.create({
      data: {
        userId: user.id,
        planId: plan.id,
        fulfillmentType: FulfillmentType.ADMIN_GRANT,
        status: UserPlanStatus.ACTIVE,
        initialUnifiedQuota: 100,
        remainingUnifiedQuota: 100,
        activatedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    userPlanId = userPlan.id;
    const key = await app
      .get(ApiKeysService)
      .create(user.id, '网关测试 Key');
    apiKeyId = key.id;
    plaintext = key.plaintext;
    accessToken = await app.get(JwtService).signAsync(
      { sub: user.id, type: 'user' },
      { audience: 'miniapp' },
    );
  });

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.usageLedger.deleteMany({ where: { userId } });
        await prisma.apiCall.deleteMany({ where: { userId } });
        if (apiKeyId) {
          await prisma.apiKey.deleteMany({ where: { id: apiKeyId } });
        }
        if (userPlanId) {
          await prisma.userPlan.deleteMany({
            where: { id: userPlanId },
          });
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
        if (providerId) {
          await prisma.provider.deleteMany({
            where: { id: providerId },
          });
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

  it('forwards a normal request and atomically charges Unicode characters', async () => {
    await request(app.getHttpServer())
      .post('/v1/chat/completions')
      .send({
        model: `gateway-model-${runId}`,
        messages: [{ role: 'user', content: 'A你😀' }],
      })
      .expect(401);

    const response = await request(app.getHttpServer())
      .post('/v1/chat/completions')
      .set('Authorization', `Bearer ${plaintext}`)
      .set('X-Request-Id', plaintext)
      .send({
        model: `gateway-model-${runId}`,
        messages: [{ role: 'user', content: 'A你😀' }],
      })
      .expect(200);

    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f-]{36}$/,
    );
    expect(response.headers['x-request-id']).not.toBe(plaintext);
    expect(response.body).toMatchObject({
      object: 'chat.completion',
      model: `gateway-model-${runId}`,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: '测试响应：A你😀',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_characters: 3,
        completion_characters: 8,
        total_characters: 11,
      },
    });

    const plan = await prisma.userPlan.findUniqueOrThrow({
      where: { id: userPlanId },
    });
    expect(plan.remainingUnifiedQuota).toBe(89n);
    const call = await prisma.apiCall.findUniqueOrThrow({
      where: {
        requestId: response.headers['x-request-id'] as string,
      },
    });
    expect(call).toMatchObject({
      inputCharacters: 3,
      outputCharacters: 8,
      chargedUnits: 11n,
      httpStatus: 200,
    });
    expect(
      Object.values(call)
        .filter((value): value is string => typeof value === 'string')
        .join('|'),
    ).not.toContain(plaintext);
  });

  it('does not charge when upstream fails before output', async () => {
    provider.failNextBeforeOutput();
    const privatePrompt = `private-${runId}`;

    const response = await request(app.getHttpServer())
      .post('/v1/chat/completions')
      .set('Authorization', `Bearer ${plaintext}`)
      .send({
        model: `gateway-model-${runId}`,
        messages: [{ role: 'user', content: privatePrompt }],
      })
      .expect(502);

    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f-]{36}$/,
    );
    const plan = await prisma.userPlan.findUniqueOrThrow({
      where: { id: userPlanId },
    });
    expect(plan.remainingUnifiedQuota).toBe(89n);
    const call = await prisma.apiCall.findUniqueOrThrow({
      where: {
        requestId: response.headers['x-request-id'] as string,
      },
    });
    expect(call).toMatchObject({
      chargedUnits: 0n,
      httpStatus: 502,
      errorSummary: 'Upstream request failed',
    });
    expect(
      Object.values(call)
        .filter((value): value is string => typeof value === 'string')
        .join('|'),
    ).not.toContain(privatePrompt);
  });

  it('streams SSE chunks and charges the emitted Unicode characters', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/chat/completions')
      .set('Authorization', `Bearer ${plaintext}`)
      .send({
        model: `gateway-model-${runId}`,
        messages: [{ role: 'user', content: 'A' }],
        stream: true,
      })
      .expect('content-type', /text\/event-stream/)
      .expect(200);

    expect(response.text).toContain('"content":"测试响应："');
    expect(response.text).toContain('"content":"A"');
    expect(response.text).toContain('data: [DONE]');

    const plan = await prisma.userPlan.findUniqueOrThrow({
      where: { id: userPlanId },
    });
    expect(plan.remainingUnifiedQuota).toBe(82n);
    const call = await prisma.apiCall.findUniqueOrThrow({
      where: {
        requestId: response.headers['x-request-id'] as string,
      },
    });
    expect(call).toMatchObject({
      inputCharacters: 1,
      outputCharacters: 6,
      chargedUnits: 7n,
      httpStatus: 200,
    });
  });

  it('charges only emitted text when a stream fails midway', async () => {
    provider.failNextStreamAfterFirstChunk();

    const response = await request(app.getHttpServer())
      .post('/v1/chat/completions')
      .set('Authorization', `Bearer ${plaintext}`)
      .send({
        model: `gateway-model-${runId}`,
        messages: [{ role: 'user', content: 'private stream input' }],
        stream: true,
      })
      .expect('content-type', /text\/event-stream/)
      .expect(200);

    expect(response.text).toContain('"content":"测试响应："');
    expect(response.text).toContain('"code":"UPSTREAM_TIMEOUT"');
    expect(response.text).not.toContain('private stream input');

    const plan = await prisma.userPlan.findUniqueOrThrow({
      where: { id: userPlanId },
    });
    expect(plan.remainingUnifiedQuota).toBe(57n);
    const call = await prisma.apiCall.findUniqueOrThrow({
      where: {
        requestId: response.headers['x-request-id'] as string,
      },
    });
    expect(call).toMatchObject({
      inputCharacters: 20,
      outputCharacters: 5,
      chargedUnits: 25n,
      httpStatus: 502,
      errorCode: 'UPSTREAM_TIMEOUT',
      errorSummary: 'Upstream request failed',
    });
  });

  it('serializes concurrent calls so quota cannot be overdrawn', async () => {
    await prisma.userPlan.update({
      where: { id: userPlanId },
      data: {
        remainingUnifiedQuota: 7,
        status: UserPlanStatus.ACTIVE,
      },
    });

    const send = () =>
      request(app.getHttpServer())
        .post('/v1/chat/completions')
        .set('Authorization', `Bearer ${plaintext}`)
        .send({
          model: `gateway-model-${runId}`,
          messages: [{ role: 'user', content: 'A' }],
        });
    const responses = await Promise.all([send(), send()]);
    expect(responses.map(({ status }) => status).sort()).toEqual([
      200,
      409,
    ]);

    const plan = await prisma.userPlan.findUniqueOrThrow({
      where: { id: userPlanId },
    });
    expect(plan.remainingUnifiedQuota).toBe(0n);
    expect(plan.status).toBe(UserPlanStatus.EXHAUSTED);

    const requestIds = responses.map(
      (response) => response.headers['x-request-id'] as string,
    );
    const calls = await prisma.apiCall.findMany({
      where: { requestId: { in: requestIds } },
      orderBy: { httpStatus: 'asc' },
    });
    expect(calls).toHaveLength(2);
    expect(
      calls.filter((call) => call.httpStatus === 200),
    ).toHaveLength(1);
    expect(
      calls.filter((call) => call.errorCode === 'QUOTA_EXHAUSTED'),
    ).toHaveLength(1);
  });

  it('rate limits an API key before another upstream call', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/chat/completions')
      .set('Authorization', `Bearer ${plaintext}`)
      .send({
        model: `gateway-model-${runId}`,
        messages: [{ role: 'user', content: 'rate limit' }],
      })
      .expect(429);

    const call = await prisma.apiCall.findUniqueOrThrow({
      where: {
        requestId: response.headers['x-request-id'] as string,
      },
    });
    expect(call).toMatchObject({
      chargedUnits: 0n,
      httpStatus: 429,
      errorCode: 'RATE_LIMITED',
      errorSummary: 'Request rate limited',
    });
  });

  it('returns authenticated usage, call logs, and plans with bounded pagination', async () => {
    await request(app.getHttpServer())
      .get('/me/usage/summary')
      .expect(401);

    const summary = await request(app.getHttpServer())
      .get('/me/usage/summary')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(summary.body).toMatchObject({
      callCount: 7,
      remainingUnits: 0,
    });
    expect(summary.body.inputCharacters).toBeGreaterThan(0);
    expect(summary.body.outputCharacters).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .get('/me/api-calls?pageSize=101')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);

    const calls = await request(app.getHttpServer())
      .get('/me/api-calls?page=1&pageSize=2')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(calls.body).toMatchObject({
      page: 1,
      pageSize: 2,
      total: 7,
    });
    expect(calls.body.items).toHaveLength(2);
    expect(
      new Date(calls.body.items[0].createdAt).getTime(),
    ).toBeGreaterThanOrEqual(
      new Date(calls.body.items[1].createdAt).getTime(),
    );
    expect(JSON.stringify(calls.body)).not.toContain(plaintext);

    const plans = await request(app.getHttpServer())
      .get('/me/plans?page=1&pageSize=10')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(plans.body).toMatchObject({
      page: 1,
      pageSize: 10,
      total: 1,
      items: [
        expect.objectContaining({
          id: userPlanId,
          status: UserPlanStatus.EXHAUSTED,
          remainingUnifiedQuota: 0,
        }),
      ],
    });
  });
});
