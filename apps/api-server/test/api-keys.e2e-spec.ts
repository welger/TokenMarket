import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { ApiKeysService } from '../src/api-keys/api-keys.service.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { UserStatus } from '../src/generated/prisma/client.js';

describe('API key lifecycle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiKeys: ApiKeysService;
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
    TRUST_PROXY_CIDRS: '',
    UPSTREAM_BASE_URL: 'http://127.0.0.1:4010/v1',
    PAYMENT_DRIVER: 'test',
  } as const;
  const originalEnvironment = new Map<string, string | undefined>();
  let userId: string | undefined;
  let accessToken: string;
  let apiKeyId: string | undefined;

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
    apiKeys = app.get(ApiKeysService);

    const user = await prisma.user.create({
      data: { status: UserStatus.ACTIVE },
    });
    userId = user.id;
    accessToken = await app.get(JwtService).signAsync(
      { sub: user.id, type: 'user' },
      { audience: 'miniapp' },
    );
  });

  afterAll(async () => {
    try {
      if (prisma && userId) {
        await prisma.apiKey.deleteMany({ where: { userId } });
        await prisma.user.deleteMany({ where: { id: userId } });
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

  it('returns plaintext once and disables the key immediately', async () => {
    await request(app.getHttpServer())
      .get('/me/api-keys')
      .expect(401);

    const create = await request(app.getHttpServer())
      .post('/me/api-keys')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `开发环境-${runId}` })
      .expect(201);
    apiKeyId = create.body.id as string;
    const plaintext = create.body.plaintext as string;
    expect(plaintext).toMatch(
      /^sk-gw_[0-9a-f-]{36}_[A-Za-z0-9_-]{43}$/,
    );

    const stored = await prisma.apiKey.findUniqueOrThrow({
      where: { id: apiKeyId },
    });
    expect(stored.secretHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(plaintext);

    await expect(apiKeys.authenticate(plaintext)).resolves.toEqual({
      apiKeyId,
      userId,
    });

    await request(app.getHttpServer())
      .get('/me/api-keys')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual([
          expect.objectContaining({
            id: apiKeyId,
            masked: expect.stringMatching(
              /^sk-gw_[0-9a-f-]{36}_\*{4}[A-Za-z0-9_-]{4}$/,
            ),
            status: 'ACTIVE',
          }),
        ]);
        expect(JSON.stringify(body)).not.toContain(plaintext);
        expect(JSON.stringify(body)).not.toContain(stored.secretHash);
      });

    await request(app.getHttpServer())
      .post(`/me/api-keys/${apiKeyId}/disable`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('DISABLED');
      });

    await expect(
      apiKeys.authenticate(plaintext),
    ).rejects.toBeDefined();
  });
});
