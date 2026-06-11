import { randomUUID } from 'node:crypto';

import {
  Body,
  Controller,
  Get,
  INestApplication,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash, argon2id } from 'argon2';
import request from 'supertest';

import { AuditedAction } from '../src/audit/audited-action.decorator.js';
import { AuditInterceptor } from '../src/audit/audit.interceptor.js';
import { AdminJwtGuard } from '../src/auth/admin-jwt.guard.js';
import { Roles } from '../src/auth/roles.decorator.js';
import { RolesGuard } from '../src/auth/roles.guard.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import {
  AdminRole,
  AdminUserStatus,
} from '../src/generated/prisma/client.js';

type AuthenticatedRequest = {
  user: { sub: string; role: AdminRole; type: 'admin' };
};

@Controller('admin/models')
@UseGuards(AdminJwtGuard, RolesGuard)
class ModelsProbeController {
  @Get()
  @Roles(AdminRole.OWNER, AdminRole.OPERATOR)
  enter(): { allowed: true } {
    return { allowed: true };
  }
}

@Controller('admin/plans')
@UseGuards(AdminJwtGuard, RolesGuard)
class PlansProbeController {
  @Post()
  @Roles(AdminRole.OWNER, AdminRole.OPERATOR)
  @UseInterceptors(AuditInterceptor)
  @AuditedAction({
    action: 'PLAN_PRICE_CHANGED',
    resourceType: 'plan',
    resourceId: ({ request: httpRequest }) =>
      String(httpRequest.body?.planId),
    beforeSummary: ({ request: httpRequest }) =>
      httpRequest.body?.beforeSummary,
    afterSummary: ({ result }) => result,
  })
  changePrice(
    @Body()
    body: {
      planId: string;
      priceMinor: number;
      password?: string;
      apiKey?: string;
    },
    @Req() httpRequest: AuthenticatedRequest,
  ): Record<string, unknown> {
    return {
      planId: body.planId,
      priceMinor: body.priceMinor,
      changedBy: httpRequest.user.sub,
      token: 'must-not-be-stored',
    };
  }
}

describe('admin authentication, RBAC and audit (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const runId = randomUUID();
  const password = `Local-only-${runId}`;
  const plainIp = '203.0.113.42';
  const usernames = Object.values(AdminRole).map(
    (role) => `task4-${role.toLowerCase()}-${runId}`,
  );
  const disabledUsername = `task4-disabled-${runId}`;
  const createdAdminIds: string[] = [];

  async function loginAs(
    username: string,
    suppliedPassword = password,
  ): Promise<request.Response> {
    return request(app.getHttpServer()).post('/admin/auth/login').send({
      username,
      password: suppliedPassword,
    });
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL =
      'postgresql://gateway:gateway_local@127.0.0.1:5432/gateway';
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
    process.env.JWT_ACCESS_SECRET = 'jwt-test-secret-not-for-production-123456';
    process.env.API_KEY_PEPPER = 'audit-test-pepper-not-for-production-123';
    process.env.UPSTREAM_BASE_URL = 'http://127.0.0.1:4010/v1';
    process.env.PAYMENT_DRIVER = 'test';

    const { AppModule } = await import('../src/app.module.js');
    const { AuditModule } = await import('../src/audit/audit.module.js');
    const { AuthModule } = await import('../src/auth/auth.module.js');
    const testingModule = await Test.createTestingModule({
      imports: [AppModule, AuthModule, AuditModule],
      controllers: [ModelsProbeController, PlansProbeController],
    }).compile();

    app = testingModule.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

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
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.auditLog.deleteMany({
        where: { adminUserId: { in: createdAdminIds } },
      });
      await prisma.adminUser.deleteMany({
        where: { id: { in: createdAdminIds } },
      });
    }
    await app?.close();
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
      .post('/admin/plans')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ planId: 'plan_support', priceMinor: 200 })
      .expect(403);

    await expect(
      prisma.auditLog.count({
        where: { adminUserId: createdAdminIds[2] },
      }),
    ).resolves.toBe(beforeCount);
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
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as {
      sub: string;
      role: AdminRole;
      type: string;
      iat: number;
      exp: number;
    };
    expect(payload).toMatchObject({
      sub: storedBefore.id,
      role: AdminRole.OWNER,
      type: 'admin',
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
      .post('/admin/plans')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .set('X-Request-Id', requestId)
      .set('X-Forwarded-For', plainIp)
      .send({
        planId: `plan-${runId}`,
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
      resourceId: `plan-${runId}`,
      requestId,
    });
    expect(audit.ipHash).toMatch(/^[a-f0-9]{64}$/);
    expect(serialized).not.toContain(plainIp);
    expect(serialized).not.toContain('request-password');
    expect(serialized).not.toContain('request-api-key');
    expect(serialized).not.toContain('before-secret');
    expect(serialized).not.toContain('must-not-be-stored');
  });
});
