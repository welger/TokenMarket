import {
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { jest } from '@jest/globals';

import { AdminLoginThrottleService } from './admin-login-throttle.service.js';
import type { EnvironmentVariables } from '../common/config/env.schema.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import type { ConfigService } from '@nestjs/config';

const future = new Date(Date.now() + 60_000);

function createHarness(state = {
  failureCount: 0,
  blockedUntil: null,
  leaseToken: null,
  leaseExpiresAt: null,
  expiresAt: future,
}) {
  const executeRaw = jest.fn().mockResolvedValue(1);
  const queryRaw = jest.fn().mockResolvedValue([state]);
  const update = jest.fn().mockResolvedValue(state);
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
  const transaction = {
    $executeRaw: executeRaw,
    $queryRaw: queryRaw,
    adminLoginThrottle: { update, updateMany, deleteMany },
  };
  const prisma = {
    $transaction: jest.fn(
      async (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
    adminLoginThrottle: { deleteMany },
  } as unknown as PrismaService;
  const config = {
    get: jest.fn().mockReturnValue(
      'audit-ip-test-secret-not-for-production-123',
    ),
  } as unknown as ConfigService<EnvironmentVariables, true>;
  const service = new AdminLoginThrottleService(prisma, config);

  return {
    service,
    prisma,
    transaction,
    executeRaw,
    queryRaw,
    update,
    updateMany,
    deleteMany,
  };
}

describe('AdminLoginThrottleService', () => {
  it('removes at most 100 expired rows before acquiring a new lease', async () => {
    const harness = createHarness();

    await harness.service.beginAttempt('owner', '203.0.113.7');

    expect(harness.executeRaw).toHaveBeenCalled();
    expect(
      (
        harness.executeRaw.mock.calls[0]?.[0] as unknown as string[]
      ).join(' '),
    ).toContain('LIMIT 100');
  });

  it('stores separate keyed username and IP hashes while acquiring leases', async () => {
    const harness = createHarness();

    await harness.service.beginAttempt('owner@example.test', '203.0.113.7');

    const updateInputs = harness.update.mock.calls.map(
      ([input]) =>
        input as {
          where: { keyHash: string };
          data: { leaseToken: string; leaseExpiresAt: Date };
        },
    );
    expect(updateInputs).toHaveLength(2);
    expect(new Set(updateInputs.map(({ where }) => where.keyHash)).size).toBe(2);
    for (const updateInput of updateInputs) {
      expect(updateInput.where.keyHash).toMatch(/^[a-f0-9]{64}$/);
      expect(updateInput.data.leaseToken).toEqual(expect.any(String));
      expect(updateInput.data.leaseExpiresAt).toBeInstanceOf(Date);
    }
    expect(JSON.stringify(updateInputs)).not.toContain('owner@example.test');
    expect(JSON.stringify(updateInputs)).not.toContain('203.0.113.7');
  });

  it('rejects an identity whose failure window is blocked', async () => {
    const harness = createHarness({
      failureCount: 5,
      blockedUntil: future,
      leaseToken: null,
      leaseExpiresAt: null,
      expiresAt: future,
    });

    await expect(
      harness.service.beginAttempt('owner', '203.0.113.7'),
    ).rejects.toMatchObject<HttpException>({ status: 429 });
    expect(harness.update).not.toHaveBeenCalled();
  });

  it('turns the fifth failure into a five-minute block', async () => {
    const harness = createHarness({
      failureCount: 4,
      blockedUntil: null,
      leaseToken: null,
      leaseExpiresAt: null,
      expiresAt: future,
    });
    const lease = await harness.service.beginAttempt(
      'owner',
      '203.0.113.7',
    );
    const acquiredLeaseToken = (
      harness.update.mock.calls[0]?.[0] as {
        data: { leaseToken: string };
      }
    ).data.leaseToken;
    harness.queryRaw.mockResolvedValue([
      {
        failureCount: 4,
        blockedUntil: null,
        leaseToken: acquiredLeaseToken,
        leaseExpiresAt: future,
        expiresAt: future,
      },
    ]);

    await lease.recordFailure();

    const failureUpdates = harness.update.mock.calls.slice(2).map(
      ([input]) =>
        input as {
          data: {
            failureCount: number;
            blockedUntil: Date;
            leaseToken: null;
          };
        },
    );
    expect(failureUpdates).toHaveLength(2);
    for (const failureUpdate of failureUpdates) {
      expect(failureUpdate.data.failureCount).toBe(5);
      expect(failureUpdate.data.blockedUntil).toBeInstanceOf(Date);
      expect(failureUpdate.data.leaseToken).toBeNull();
    }
  });

  it('fails closed when the database is unavailable', async () => {
    const harness = createHarness();
    (
      harness.prisma.$transaction as jest.MockedFunction<
        PrismaService['$transaction']
      >
    ).mockRejectedValueOnce(new Error('database unavailable'));

    await expect(
      harness.service.beginAttempt('owner', '203.0.113.7'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
