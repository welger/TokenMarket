import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { hash, argon2id } from 'argon2';

import { AuditService } from './audit.service.js';
import type { EnvironmentVariables } from '../common/config/env.schema.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import {
  AdminRole,
  AdminUserStatus,
  PlanActivationMode,
  PlanStatus,
} from '../generated/prisma/client.js';

describe('AuditService audited transactions', () => {
  const runId = randomUUID();
  const requestIdPrefix = `audit-transaction-${runId}`;
  let prisma: PrismaService;
  let service: AuditService;
  let adminUserId: string;
  let planId: string;

  beforeAll(async () => {
    const values: EnvironmentVariables = {
      NODE_ENV: 'test',
      PORT: 3000,
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://gateway:gateway_local@127.0.0.1:5432/gateway',
      REDIS_URL: 'redis://127.0.0.1:6379',
      JWT_ACCESS_SECRET: 'j'.repeat(32),
      API_KEY_PEPPER: 'p'.repeat(32),
      UPSTREAM_BASE_URL: 'http://127.0.0.1:4010/v1',
      UPSTREAM_DEFAULT_MODEL: 'test-model',
      PAYMENT_DRIVER: 'test',
    };
    const config = {
      get: <Key extends keyof EnvironmentVariables>(key: Key) => values[key],
    } as ConfigService<EnvironmentVariables, true>;

    prisma = new PrismaService(config);
    await prisma.$connect();
    service = new AuditService(prisma, config);

    const admin = await prisma.adminUser.create({
      data: {
        username: `audit-transaction-${runId}`,
        displayName: 'Audit transaction test',
        passwordHash: await hash(`Local-only-${runId}`, { type: argon2id }),
        role: AdminRole.OWNER,
        status: AdminUserStatus.ACTIVE,
      },
    });
    adminUserId = admin.id;

    const plan = await prisma.plan.create({
      data: {
        name: `Audit transaction plan ${runId}`,
        description: 'Local integration test only',
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
    if (prisma) {
      await prisma.auditLog.deleteMany({
        where: { requestId: { startsWith: requestIdPrefix } },
      });
      if (planId) {
        await prisma.plan.delete({ where: { id: planId } });
      }
      if (adminUserId) {
        await prisma.adminUser.delete({ where: { id: adminUserId } });
      }
      await prisma.$disconnect();
    }
  });

  it('rolls back the business update when the audit insert fails', async () => {
    const requestId = `${requestIdPrefix}-rollback`;

    await expect(
      service.executeAuditedMutation(
        async (transaction) =>
          transaction.plan.update({
            where: { id: planId },
            data: { priceMinor: 200 },
          }),
        (updatedPlan) => ({
          adminUserId: `missing-admin-${runId}`,
          action: 'PLAN_PRICE_CHANGED',
          resourceType: 'plan',
          resourceId: planId,
          requestId,
          beforeSummary: { priceMinor: 100 },
          afterSummary: { priceMinor: updatedPlan.priceMinor },
          ip: '203.0.113.42',
        }),
      ),
    ).rejects.toThrow();

    await expect(
      prisma.plan.findUniqueOrThrow({ where: { id: planId } }),
    ).resolves.toMatchObject({ priceMinor: 100 });
    await expect(
      prisma.auditLog.count({ where: { requestId } }),
    ).resolves.toBe(0);
  });

  it('commits the business update and audit row together', async () => {
    const requestId = `${requestIdPrefix}-commit`;

    const updatedPlan = await service.executeAuditedMutation(
      async (transaction) =>
        transaction.plan.update({
          where: { id: planId },
          data: { priceMinor: 300 },
        }),
      (result) => ({
        adminUserId,
        action: 'PLAN_PRICE_CHANGED',
        resourceType: 'plan',
        resourceId: planId,
        requestId,
        beforeSummary: { priceMinor: 100 },
        afterSummary: {
          priceMinor: result.priceMinor,
          password: 'must-not-be-stored',
        },
        ip: '203.0.113.42',
      }),
    );

    expect(updatedPlan.priceMinor).toBe(300);
    await expect(
      prisma.plan.findUniqueOrThrow({ where: { id: planId } }),
    ).resolves.toMatchObject({ priceMinor: 300 });

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { requestId },
    });
    expect(audit).toMatchObject({
      adminUserId,
      resourceId: planId,
      afterSummary: { priceMinor: 300 },
    });
    expect(JSON.stringify(audit)).not.toContain('must-not-be-stored');
    expect(JSON.stringify(audit)).not.toContain('203.0.113.42');
  });
});
