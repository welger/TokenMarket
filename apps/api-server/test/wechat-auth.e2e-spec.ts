import { randomBytes } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { configureTrustedProxy } from '../src/common/http/configure-trusted-proxy.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';

const localHostnames = new Set(['localhost', '127.0.0.1']);

describe('WeChat authentication E2E resource guards', () => {
  const originalCi = process.env.CI;
  const originalDatabaseUrl =
    process.env.WECHAT_AUTH_E2E_DATABASE_URL;
  const originalRedisUrl = process.env.WECHAT_AUTH_E2E_REDIS_URL;

  afterEach(() => {
    restoreEnvironmentValue('CI', originalCi);
    restoreEnvironmentValue(
      'WECHAT_AUTH_E2E_DATABASE_URL',
      originalDatabaseUrl,
    );
    restoreEnvironmentValue(
      'WECHAT_AUTH_E2E_REDIS_URL',
      originalRedisUrl,
    );
  });

  it('requires an explicit e2e database name outside CI', () => {
    process.env.CI = 'false';
    process.env.WECHAT_AUTH_E2E_DATABASE_URL =
      'postgresql://test:test@127.0.0.1:5432/gateway';

    expect(() =>
      requireLocalE2eUrl('WECHAT_AUTH_E2E_DATABASE_URL'),
    ).toThrow('database name must include e2e outside CI');
  });

  it('allows the temporary gateway database name in CI', () => {
    process.env.CI = 'true';
    process.env.WECHAT_AUTH_E2E_DATABASE_URL =
      'postgresql://test:test@127.0.0.1:5432/gateway';

    expect(() =>
      requireLocalE2eUrl('WECHAT_AUTH_E2E_DATABASE_URL'),
    ).not.toThrow();
  });

  it('requires a non-zero Redis logical database outside CI', () => {
    process.env.CI = 'false';
    process.env.WECHAT_AUTH_E2E_REDIS_URL =
      'redis://127.0.0.1:6379/0';

    expect(() =>
      requireLocalE2eUrl('WECHAT_AUTH_E2E_REDIS_URL'),
    ).toThrow('must use a non-zero Redis logical database');
  });

  it('requires Redis logical database 15 in CI', () => {
    process.env.CI = 'true';
    process.env.WECHAT_AUTH_E2E_REDIS_URL =
      'redis://127.0.0.1:6379/14';

    expect(() =>
      requireLocalE2eUrl('WECHAT_AUTH_E2E_REDIS_URL'),
    ).toThrow('must use Redis logical database 15 in CI');
  });

  it.each([
    [
      'WECHAT_AUTH_E2E_DATABASE_URL',
      'postgresql://test:test@127.0.0.1:5432/gateway_e2e?host=external.example',
    ],
    [
      'WECHAT_AUTH_E2E_DATABASE_URL',
      'postgresql://test:test@127.0.0.1:5432/gateway_e2e#private-fragment',
    ],
    [
      'WECHAT_AUTH_E2E_REDIS_URL',
      'redis://127.0.0.1:6379/15?private-option=value',
    ],
    [
      'WECHAT_AUTH_E2E_REDIS_URL',
      'redis://127.0.0.1:6379/15#private-fragment',
    ],
    [
      'WECHAT_AUTH_E2E_DATABASE_URL',
      'postgresql://test:test@127.0.0.1:5432/gateway_e2e?',
    ],
    [
      'WECHAT_AUTH_E2E_REDIS_URL',
      'redis://127.0.0.1:6379/15#',
    ],
  ] as const)('rejects query or hash in %s', (name, privateUrl) => {
    process.env.CI = 'true';
    process.env[name] = privateUrl;

    let error: Error | undefined;
    try {
      requireLocalE2eUrl(name);
    } catch (caught) {
      error = caught as Error;
    }

    expect(error?.message).toBe(
      `${name} must not include query parameters or fragments`,
    );
    expect(error?.message).not.toContain(privateUrl);
    expect(error?.message).not.toContain('external.example');
    expect(error?.message).not.toContain('private-fragment');
  });
});

function requireLocalE2eUrl(
  name:
    | 'WECHAT_AUTH_E2E_DATABASE_URL'
    | 'WECHAT_AUTH_E2E_REDIS_URL',
): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }

  if (value.includes('?') || value.includes('#')) {
    throw new Error(
      `${name} must not include query parameters or fragments`,
    );
  }

  if (!localHostnames.has(parsedUrl.hostname)) {
    throw new Error(`${name} must use localhost or 127.0.0.1`);
  }

  if (name === 'WECHAT_AUTH_E2E_DATABASE_URL') {
    const databaseName = decodeURIComponent(
      parsedUrl.pathname.replace(/^\/+/, ''),
    );
    if (
      process.env.CI !== 'true' &&
      !databaseName.toLowerCase().includes('e2e')
    ) {
      throw new Error(
        `${name} database name must include e2e outside CI`,
      );
    }
  } else {
    const redisDatabaseText = parsedUrl.pathname.replace(/^\/+/, '');
    const redisDatabase = Number(redisDatabaseText || '0');
    if (!Number.isSafeInteger(redisDatabase) || redisDatabase <= 0) {
      throw new Error(
        `${name} must use a non-zero Redis logical database`,
      );
    }
    if (process.env.CI === 'true' && redisDatabase !== 15) {
      throw new Error(`${name} must use Redis logical database 15 in CI`);
    }
  }

  return value;
}

function restoreEnvironmentValue(
  name: string,
  value: string | undefined,
): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe('WeChat authentication (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const runSuffix = randomBytes(18).toString('base64url');
  const validCode = `test:${runSuffix}`;
  const wechatOpenId = `openid_test_${runSuffix}`;
  const invalidSafeId = `${runSuffix}_invalid`;
  const invalidCode = `wx-${invalidSafeId}`;
  const ipSeed = randomBytes(3);
  const ipPrefix = `100.${64 + (ipSeed[0]! % 64)}.${ipSeed[1]}`;
  const ipStart = ipSeed[2]! % 190;
  const forwardedIp = (offset: number): string =>
    `${ipPrefix}.${ipStart + offset}`;
  const environmentDefaults = {
    JWT_ACCESS_SECRET: 'jwt-test-secret-not-for-production-123456',
    API_KEY_PEPPER: 'api-key-test-pepper-not-for-production-123',
    AUDIT_IP_HASH_SECRET:
      'audit-ip-test-secret-not-for-production-123',
    ADMIN_LOGIN_THROTTLE_SECRET:
      'login-throttle-test-secret-not-for-production',
    GATEWAY_IP_RATE_LIMIT_PER_MINUTE: '100',
    GATEWAY_USER_RATE_LIMIT_PER_MINUTE: '100',
    GATEWAY_KEY_RATE_LIMIT_PER_MINUTE: '100',
    UPSTREAM_BASE_URL: 'http://127.0.0.1:4010/v1',
    PAYMENT_DRIVER: 'test',
  } as const;
  const originalEnvironment = new Map<string, string | undefined>();

  beforeAll(async () => {
    const forcedEnvironment = {
      ...environmentDefaults,
      NODE_ENV: 'test',
      DATABASE_URL: requireLocalE2eUrl(
        'WECHAT_AUTH_E2E_DATABASE_URL',
      ),
      REDIS_URL: requireLocalE2eUrl('WECHAT_AUTH_E2E_REDIS_URL'),
      TRUST_PROXY_CIDRS: 'loopback',
      WECHAT_LOGIN_RATE_LIMIT_PER_MINUTE: '2',
      WECHAT_TEST_LOGIN_ENABLED: 'true',
    } as const;

    for (const [key, value] of Object.entries(forcedEnvironment)) {
      originalEnvironment.set(key, process.env[key]);
      process.env[key] = value;
    }

    jest.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('External HTTP is forbidden in WeChat auth e2e tests'),
    );

    const { AppModule } = await import('../src/app.module.js');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication({ logger: false });
    configureTrustedProxy(app, ['loopback']);
    await app.init();
    prisma = app.get(PrismaService);
  }, 30_000);

  afterAll(async () => {
    try {
      if (prisma) {
        const users = await prisma.user.findMany({
          where: { wechatOpenId: { contains: runSuffix } },
          select: { id: true },
        });
        const userIds = users.map(({ id }) => id);

        if (userIds.length > 0) {
          const userFilter = { userId: { in: userIds } };
          await prisma.usageLedger.deleteMany({ where: userFilter });
          await prisma.apiCall.deleteMany({ where: userFilter });
          await prisma.apiKey.deleteMany({ where: userFilter });
          await prisma.userPlan.deleteMany({ where: userFilter });
          await prisma.invoiceOrder.deleteMany({ where: userFilter });
          await prisma.refund.deleteMany({ where: userFilter });
          await prisma.invoice.deleteMany({ where: userFilter });
          await prisma.order.deleteMany({ where: userFilter });
          await prisma.user.deleteMany({
            where: { id: { in: userIds } },
          });
        }
      }
    } finally {
      try {
        await app?.close();
      } finally {
        try {
          jest.restoreAllMocks();
        } finally {
          for (const [key, value] of originalEnvironment) {
            restoreEnvironmentValue(key, value);
          }
        }
      }
    }
  }, 30_000);

  it('returns an access token and user id for a safe test code', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/wechat/login')
      .set('X-Forwarded-For', forwardedIp(10))
      .send({ code: validCode })
      .expect(201);

    expect(response.body).toEqual({
      accessToken: expect.any(String),
      userId: expect.any(String),
    });
    expect(response.body.accessToken).not.toHaveLength(0);

    const storedUser = await prisma.user.findUniqueOrThrow({
      where: { wechatOpenId },
      select: { id: true },
    });
    expect(storedUser.id).toBe(response.body.userId);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('reuses the same user for repeated login with the same code', async () => {
    const first = await request(app.getHttpServer())
      .post('/auth/wechat/login')
      .set('X-Forwarded-For', forwardedIp(20))
      .send({ code: validCode })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/auth/wechat/login')
      .set('X-Forwarded-For', forwardedIp(20))
      .send({ code: validCode })
      .expect(201);

    expect(second.body.userId).toBe(first.body.userId);
    await expect(
      prisma.user.count({ where: { wechatOpenId } }),
    ).resolves.toBe(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('accepts the returned token through the real user JWT guard', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/wechat/login')
      .set('X-Forwarded-For', forwardedIp(30))
      .send({ code: validCode })
      .expect(201);

    const summary = await request(app.getHttpServer())
      .get('/me/usage/summary')
      .set('Authorization', `Bearer ${login.body.accessToken as string}`)
      .expect(200);

    expect(summary.body).toMatchObject({
      callCount: 0,
      inputCharacters: 0,
      outputCharacters: 0,
      chargedUnits: 0,
      remainingUnits: 0,
    });
  });

  it('rejects a non-test code without leaking it or creating a user', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/wechat/login')
      .set('X-Forwarded-For', forwardedIp(40))
      .send({ code: invalidCode })
      .expect(401);

    expect(
      JSON.stringify({
        body: response.body,
        text: response.text,
        headers: response.headers,
      }),
    ).not.toContain(invalidCode);
    await expect(
      prisma.user.count({
        where: {
          wechatOpenId: {
            in: [invalidCode, `openid_test_${invalidSafeId}`],
          },
        },
      }),
    ).resolves.toBe(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['missing code', {}, 50],
    ['empty code', { code: '' }, 51],
  ])('returns 400 for %s', async (_label, body, ipOffset) => {
    await request(app.getHttpServer())
      .post('/auth/wechat/login')
      .set('X-Forwarded-For', forwardedIp(ipOffset))
      .send(body)
      .expect(400);
  });

  it('returns RATE_LIMITED on the third login from one IP', async () => {
    const forwardedFor = forwardedIp(60);
    const rateLimitCode = `test:${runSuffix}_rate_limit`;

    await request(app.getHttpServer())
      .post('/auth/wechat/login')
      .set('X-Forwarded-For', forwardedFor)
      .send({ code: rateLimitCode })
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/wechat/login')
      .set('X-Forwarded-For', forwardedFor)
      .send({ code: rateLimitCode })
      .expect(201);
    const response = await request(app.getHttpServer())
      .post('/auth/wechat/login')
      .set('X-Forwarded-For', forwardedFor)
      .send({ code: rateLimitCode })
      .expect(429);

    expect(response.body).toMatchObject({ code: 'RATE_LIMITED' });
  });
});
