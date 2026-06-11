import { ConfigService } from '@nestjs/config';
import { jest } from '@jest/globals';

import type { EnvironmentVariables } from '../common/config/env.schema.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import { AuditService } from './audit.service.js';

describe('AuditService', () => {
  it('recursively removes secrets and stores only a keyed IP hash', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'audit_1' });
    const prisma = {
      auditLog: { create },
    } as unknown as PrismaService;
    const config = {
      get: jest.fn().mockReturnValue('p'.repeat(32)),
    } as unknown as ConfigService<EnvironmentVariables, true>;
    const service = new AuditService(prisma, config);
    const plainIp = '203.0.113.42';

    await service.record({
      adminUserId: 'admin_1',
      action: 'PLAN_PRICE_CHANGED',
      resourceType: 'plan',
      resourceId: 'plan_1',
      requestId: 'req_1',
      beforeSummary: {
        priceMinor: 100,
        password: 'before-password',
        nested: {
          apiKey: 'before-api-key',
          secretKey: 'before-secret-key',
          safe: 'visible',
        },
      },
      afterSummary: {
        priceMinor: 200,
        credentials: [
          {
            authorization: 'Bearer private-token',
            secret: 'private-secret',
          },
        ],
      },
      ip: plainIp,
    });

    const data = create.mock.calls[0]?.[0]?.data;
    const serialized = JSON.stringify(data);

    expect(data).toMatchObject({
      adminUserId: 'admin_1',
      action: 'PLAN_PRICE_CHANGED',
      resourceType: 'plan',
      resourceId: 'plan_1',
      requestId: 'req_1',
      beforeSummary: {
        priceMinor: 100,
        nested: {
          safe: 'visible',
        },
      },
      afterSummary: {
        priceMinor: 200,
      },
    });
    expect(data.beforeSummary).not.toHaveProperty('password');
    expect(data.beforeSummary.nested).not.toHaveProperty('apiKey');
    expect(data.beforeSummary.nested).not.toHaveProperty('secretKey');
    expect(data.afterSummary).not.toHaveProperty('credentials');
    expect(data.ipHash).toMatch(/^[a-f0-9]{64}$/);
    expect(serialized).not.toContain(plainIp);
    expect(serialized).not.toContain('before-password');
    expect(serialized).not.toContain('before-api-key');
    expect(serialized).not.toContain('before-secret-key');
    expect(serialized).not.toContain('private-token');
    expect(serialized).not.toContain('private-secret');
  });
});
