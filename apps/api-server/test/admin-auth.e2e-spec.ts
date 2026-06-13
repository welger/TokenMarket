import { createHmac, randomUUID } from 'node:crypto';

import {
  Body,
  Controller,
  Get,
  INestApplication,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash, argon2id } from 'argon2';
import request from 'supertest';

import { AuditedAction } from '../src/audit/audited-action.decorator.js';
import { AuditService } from '../src/audit/audit.service.js';
import { AdminLoginThrottleService } from '../src/auth/admin-login-throttle.service.js';
import { AdminJwtGuard } from '../src/auth/admin-jwt.guard.js';
import { Roles } from '../src/auth/roles.decorator.js';
import { RolesGuard } from '../src/auth/roles.guard.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { configureTrustedProxy } from '../src/common/http/configure-trusted-proxy.js';
import {
  AdminRole,
  AdminUserStatus,
  PlanActivationMode,
  PlanStatus,
} from '../src/generated/prisma/client.js';

type AuthenticatedRequest = {
  user: { sub: string; role: AdminRole; type: 'admin' };
  ip: string;
  headers?: Record<string, string | string[] | undefined>;
};

@Controller('admin/models')
@UseGuards(AdminJwtGuard, RolesGuard)
class ModelsProbeController {
  @Get()
  @Roles(AdminRole.OWNER, AdminRole.OPERATOR)
  enter(): { allowed: true } {
    return { allowed: true };
  }

  @Get('observed/:modelId')
  @Roles(AdminRole.OWNER)
  @AuditedAction({
    action: 'MODEL_VIEWED',
    resourceType: 'model',
    resourceId: ({ request: httpRequest }) =>
      String(httpRequest.params?.modelId),
    afterSummary: ({ result }) => result,
  })
  observe(@Param('modelId') modelId: string): { modelId: string } {
    return { modelId };
  }
}

@Controller('admin/audit-probe/plans')
@UseGuards(AdminJwtGuard, RolesGuard)
class PlansProbeController {
  constructor(private readonly auditService: AuditService) {}

  @Post()
  @Roles(AdminRole.OWNER, AdminRole.OPERATOR)
  async changePrice(
    @Body()
    body: {
      planId: string;
      priceMinor: number;
      password?: string;
      apiKey?: string;
      beforeSummary?: Record<string, unknown>;
    },
    @Req() httpRequest: AuthenticatedRequest,
  ): Promise<Record<string, unknown>> {
    return this.auditService.runInAuditedTransaction(
      {
        adminUserId: httpRequest.user.sub,
        action: 'PLAN_PRICE_CHANGED',
        resourceType: 'plan',
        resourceId: body.planId,
        requestId: getHeader(httpRequest, 'x-request-id'),
        ip: httpRequest.ip,
      },
      async ({ transaction, setBeforeSummary, setAfterSummary }) => {
        const before = await transaction.plan.findUniqueOrThrow({
          where: { id: body.planId },
        });
        const updated = await transaction.plan.update({
          where: { id: body.planId },
          data: { priceMinor: body.priceMinor },
        });

        setBeforeSummary({
          priceMinor: before.priceMinor,
          clientSummary: body.beforeSummary,
          password: body.password,
          apiKey: body.apiKey,
        });
        setAfterSummary({
          priceMinor: updated.priceMinor,
          token: 'must-not-be-stored',
        });
        return { before, updated };
      },
    ).then(({ updated }) => ({
      planId: updated.id,
      priceMinor: updated.priceMinor,
      changedBy: httpRequest.user.sub,
    }));
  }

  @Post(':planId/fail-audit')
  @Roles(AdminRole.OWNER, AdminRole.OPERATOR)
  async failAudit(
    @Param('planId') planId: string,
    @Body() body: { priceMinor: number },
    @Req() httpRequest: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.auditService.runInAuditedTransaction(
      {
        adminUserId: `missing-${httpRequest.user.sub}`,
        action: 'PLAN_PRICE_CHANGED',
        resourceType: 'plan',
        resourceId: planId,
        requestId: `failed-${planId}`,
      },
      ({ transaction, setAfterSummary }) =>
        transaction.plan.update({
          where: { id: planId },
          data: { priceMinor: body.priceMinor },
        }).then((updated) => {
          setAfterSummary({ priceMinor: updated.priceMinor });
          return updated;
        }),
    );
  }
}

function getHeader(
  request: AuthenticatedRequest & {
    headers?: Record<string, string | string[] | undefined>;
  },
  name: string,
): string | undefined {
  const value = request.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

describe('admin authentication, RBAC and audit (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let throttle: AdminLoginThrottleService;
  const runId = randomUUID();
  const password = `Local-only-${runId}`;
  const plainIp = '203.0.113.42';
  const loginIps = new Map<string, string>();
  const usernames = Object.values(AdminRole).map(
    (role) => `task4-${role.toLowerCase()}-${runId}`,
  );
  const disabledUsername = `task4-disabled-${runId}`;
  const createdAdminIds: string[] = [];
  const throttledUsernames: string[] = [];
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
    PAYMENT_DRIVER: 'test',
  } as const;
  const originalEnvironment = new Map<string, string | undefined>();
  let planId: string;

  async function loginAs(
    username: string,
    suppliedPassword = password,
  ): Promise<request.Response> {
    const loginIp =
      loginIps.get(username) ??
      `198.51.100.${loginIps.size + 1}`;
    loginIps.set(username, loginIp);

    return request(app.getHttpServer())
      .post('/admin/auth/login')
      .set('X-Forwarded-For', loginIp)
      .send({
        username,
        password: suppliedPassword,
      });
  }

  beforeAll(async () => {
    for (const [key, value] of Object.entries(environmentDefaults)) {
      originalEnvironment.set(key, process.env[key]);
      process.env[key] ??= value;
    }

    const { AppModule } = await import('../src/app.module.js');
    const { AuditModule } = await import('../src/audit/audit.module.js');
    const { AuthModule } = await import('../src/auth/auth.module.js');
    const testingModule = await Test.createTestingModule({
      imports: [AppModule, AuthModule, AuditModule],
      controllers: [ModelsProbeController, PlansProbeController],
    }).compile();

    app = testingModule.createNestApplication({ logger: false });
    configureTrustedProxy(app, ['loopback']);
    await app.init();
    prisma = app.get(PrismaService);
    throttle = app.get(AdminLoginThrottleService);

    const passwordHash = await hash(password, { type: argon2id });
    for (const role of Object.values(AdminRole)) {
      const admin = await prisma.adminUser.create({
        data: {
          username: `task4-${role.toLowerCase()}-${runId}`,
          displayName: `Task 4 ${role}`,
          passwordHash,
          role,
          status: AdminUserStatus.ACTIVE,
        },
      });
      createdAdminIds.push(admin.id);
    }

    const disabledAdmin = await prisma.adminUser.create({
      data: {
        username: disabledUsername,
        displayName: 'Task 4 Disabled',
        passwordHash,
        role: AdminRole.OWNER,
        status: AdminUserStatus.DISABLED,
      },
    });
    createdAdminIds.push(disabledAdmin.id);

    const plan = await prisma.plan.create({
      data: {
        name: `Task 4 plan ${runId}`,
        description: 'Local e2e test only',
        priceMinor: 100,
        currency: 'CNY',
        unifiedQuota: 1000,
        activationMode: PlanActivationMode.IMMEDIATE,
        validityDays: 30,
        refundPolicy: 'Local test only',
        purchaseNotice: 'Local test only',
        status: PlanStatus.DRAFT,
      },
    });
    planId = plan.id;
  });

  afterAll(async () => {
    try {
      if (throttle) {
        await Promise.allSettled(
          [...new Set([
            ...usernames,
            disabledUsername,
            ...throttledUsernames,
          ])].map((username) =>
            throttle.clearIdentity(
              username,
              loginIps.get(username) ?? '198.51.100.254',
            ),
          ),
        );
      }
      if (prisma) {
        await prisma.auditLog.deleteMany({
          where: { adminUserId: { in: createdAdminIds } },
        });
        if (planId) {
          await prisma.auditLog.deleteMany({
            where: { resourceType: 'plan', resourceId: planId },
          });
          await prisma.plan.delete({ where: { id: planId } });
        }
        await prisma.adminUser.deleteMany({
          where: { id: { in: createdAdminIds } },
        });
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

  it('returns 401 for anonymous access to a protected admin route', async () => {
    await request(app.getHttpServer()).get('/admin/models').expect(401);
  });

  it('returns 403 for SUPPORT changing a price and writes no audit row', async () => {
    const login = await loginAs(usernames[2]!);
    const beforeCount = await prisma.auditLog.count({
      where: { adminUserId: createdAdminIds[2] },
    });

    await request(app.getHttpServer())
      .post('/admin/audit-probe/plans')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ planId, priceMinor: 200 })
      .expect(403);

    await expect(
      prisma.auditLog.count({
        where: { adminUserId: createdAdminIds[2] },
      }),
    ).resolves.toBe(beforeCount);
    await expect(
      prisma.plan.findUniqueOrThrow({ where: { id: planId } }),
    ).resolves.toMatchObject({ priceMinor: 100 });
  });

  it.each([AdminRole.OWNER, AdminRole.OPERATOR])(
    'allows %s to enter an authorized probe route',
    async (role) => {
      const username = `task4-${role.toLowerCase()}-${runId}`;
      const login = await loginAs(username);

      await request(app.getHttpServer())
        .get('/admin/models')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(200, { allowed: true });
    },
  );

  it('rejects an incorrect password with 401', async () => {
    await loginAs(usernames[0]!, 'incorrect-password').then((response) => {
      expect(response.status).toBe(401);
      expect(response.body).not.toHaveProperty('accessToken');
    });
  });

  it('rejects a disabled administrator with 401', async () => {
    await loginAs(disabledUsername).then((response) => {
      expect(response.status).toBe(401);
      expect(response.body).not.toHaveProperty('accessToken');
    });
  });

  it('returns 429 after five failed attempts for one username and IP', async () => {
    const username = `throttled-${runId}`;
    throttledUsernames.push(username);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await loginAs(username, 'wrong-password').then((response) => {
        expect(response.status).toBe(401);
      });
    }

    await loginAs(username, 'wrong-password').then((response) => {
      expect(response.status).toBe(429);
    });

    const keyHash = createHmac(
      'sha256',
      process.env.ADMIN_LOGIN_THROTTLE_SECRET!,
    )
      .update('admin-login-throttle:v1:')
      .update('username')
      .update('\0')
      .update(username)
      .digest('hex');
    const storedThrottle = await prisma.adminLoginThrottle.findUniqueOrThrow({
      where: { keyHash },
    });
    expect(storedThrottle.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(storedThrottle)).not.toContain(username);
    expect(storedThrottle.blockedUntil).not.toBeNull();
  });

  it('allows only one concurrent password verification per username and IP', async () => {
    const username = `concurrent-${runId}`;
    throttledUsernames.push(username);

    const responses = await Promise.all([
      loginAs(username, 'wrong-password'),
      loginAs(username, 'wrong-password'),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([401, 429]);
  });

  it('logs in an active administrator, updates lastLoginAt and issues a 15 minute admin JWT', async () => {
    const ownerUsername = usernames[0]!;
    const storedBefore = await prisma.adminUser.findUniqueOrThrow({
      where: { username: ownerUsername },
    });
    expect(storedBefore.passwordHash).toMatch(/^\$argon2id\$/);

    const response = await loginAs(ownerUsername);
    expect(response.status).toBe(201);
    expect(response.body.accessToken).toEqual(expect.any(String));

    const [, encodedPayload] = response.body.accessToken.split('.');
    const [encodedHeader] = response.body.accessToken.split('.');
    const header = JSON.parse(
      Buffer.from(encodedHeader, 'base64url').toString('utf8'),
    ) as { alg: string };
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as {
      sub: string;
      role: AdminRole;
      type: string;
      iat: number;
      exp: number;
      iss: string;
      aud: string;
    };
    expect(header.alg).toBe('HS256');
    expect(payload).toMatchObject({
      sub: storedBefore.id,
      role: AdminRole.OWNER,
      type: 'admin',
      iss: 'multi-model-api-platform',
      aud: 'admin-console',
    });
    expect(payload.exp - payload.iat).toBe(15 * 60);

    const storedAfter = await prisma.adminUser.findUniqueOrThrow({
      where: { username: ownerUsername },
    });
    expect(storedAfter.lastLoginAt).not.toBeNull();
  });

  it('writes a sanitized audit row without plaintext IP or sensitive fields', async () => {
    const ownerUsername = usernames[0]!;
    const login = await loginAs(ownerUsername);
    const requestId = `req-${runId}`;

    await request(app.getHttpServer())
      .post('/admin/audit-probe/plans')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .set('X-Request-Id', requestId)
      .set('X-Forwarded-For', plainIp)
      .send({
        planId,
        priceMinor: 200,
        password: 'request-password',
        apiKey: 'request-api-key',
        beforeSummary: {
          priceMinor: 100,
          secret: 'before-secret',
        },
      })
      .expect(201);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: 'PLAN_PRICE_CHANGED',
        requestId,
      },
      orderBy: { createdAt: 'desc' },
    });
    const serialized = JSON.stringify(audit);

    expect(audit).toMatchObject({
      adminUserId: createdAdminIds[0],
      action: 'PLAN_PRICE_CHANGED',
      resourceType: 'plan',
      resourceId: planId,
      requestId,
    });
    await expect(
      prisma.plan.findUniqueOrThrow({ where: { id: planId } }),
    ).resolves.toMatchObject({ priceMinor: 200 });
    expect(audit.ipHash).toMatch(/^[a-f0-9]{64}$/);
    expect(audit.ipHash).toBe(
      createHmac('sha256', process.env.AUDIT_IP_HASH_SECRET!)
        .update(`admin-audit-ip:v1:${plainIp}`)
        .digest('hex'),
    );
    expect(serialized).not.toContain(plainIp);
    expect(serialized).not.toContain('request-password');
    expect(serialized).not.toContain('request-api-key');
    expect(serialized).not.toContain('before-secret');
    expect(serialized).not.toContain('must-not-be-stored');
  });

  it('globally audits a route that only declares @AuditedAction', async () => {
    const login = await loginAs(usernames[0]!);
    const requestId = `observed-${runId}`;
    const modelId = `model-${runId}`;

    await request(app.getHttpServer())
      .get(`/admin/models/observed/${modelId}`)
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .set('X-Request-Id', requestId)
      .set('X-Forwarded-For', plainIp)
      .expect(200, { modelId });

    const audits = await prisma.auditLog.findMany({
      where: { requestId },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      adminUserId: createdAdminIds[0],
      action: 'MODEL_VIEWED',
      resourceType: 'model',
      resourceId: modelId,
    });
    expect(audits[0]?.ipHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(audits[0])).not.toContain(plainIp);
  });

  it('rolls back the price change when the audit insert fails', async () => {
    const login = await loginAs(usernames[0]!);
    const priceBeforeRequest = (
      await prisma.plan.findUniqueOrThrow({ where: { id: planId } })
    ).priceMinor;

    await request(app.getHttpServer())
      .post(`/admin/audit-probe/plans/${planId}/fail-audit`)
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ priceMinor: 999 })
      .expect(500);

    await expect(
      prisma.plan.findUniqueOrThrow({ where: { id: planId } }),
    ).resolves.toMatchObject({ priceMinor: priceBeforeRequest });
    await expect(
      prisma.auditLog.count({ where: { requestId: `failed-${planId}` } }),
    ).resolves.toBe(0);
  });
});
