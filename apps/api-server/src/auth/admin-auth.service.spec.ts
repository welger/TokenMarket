import { UnauthorizedException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { AdminAuthService } from './admin-auth.service.js';
import type {
  AdminLoginThrottleLease,
  AdminLoginThrottleService,
} from './admin-login-throttle.service.js';
import type { PasswordHasher } from './password-hasher.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import type { JwtService } from '@nestjs/jwt';
import {
  AdminRole,
  AdminUserStatus,
} from '../generated/prisma/client.js';

const activeAdmin = {
  id: 'admin_1',
  username: 'owner',
  displayName: 'Owner',
  passwordHash: 'real-hash',
  role: AdminRole.OWNER,
  status: AdminUserStatus.ACTIVE,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createHarness(admin: typeof activeAdmin | null) {
  const findUnique = jest.fn().mockResolvedValue(admin);
  const update = jest.fn().mockResolvedValue(admin);
  const prisma = {
    adminUser: { findUnique, update },
  } as unknown as PrismaService;
  const jwt = {
    signAsync: jest.fn().mockResolvedValue('access-token'),
  } as unknown as JwtService;
  const hashPassword = jest.fn(async (_password: string) => 'new-hash');
  const verifyPassword = jest.fn(
    async (_hash: string, _password: string) => false,
  );
  const hasher = {
    dummyHash: 'dummy-hash',
    hash: hashPassword,
    verify: verifyPassword,
  } as unknown as PasswordHasher;
  const lease = {
    recordFailure: jest.fn().mockResolvedValue(undefined),
    clearFailures: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
  } as unknown as AdminLoginThrottleLease;
  const throttle = {
    beginAttempt: jest.fn().mockResolvedValue(lease),
  } as unknown as AdminLoginThrottleService;
  const service = new AdminAuthService(prisma, jwt, hasher, throttle);

  return {
    service,
    findUnique,
    update,
    jwt,
    hasher,
    hashPassword,
    verifyPassword,
    throttle,
    lease,
  };
}

describe('AdminAuthService', () => {
  it('delegates Argon2id password hashing to PasswordHasher', async () => {
    const harness = createHarness(null);

    await expect(harness.service.hashPassword('local-test-password')).resolves
      .toBe('new-hash');
    expect(harness.hashPassword).toHaveBeenCalledWith(
      'local-test-password',
    );
  });

  it.each([
    ['missing administrator', null],
    [
      'disabled administrator',
      { ...activeAdmin, status: AdminUserStatus.DISABLED },
    ],
  ])('executes one dummy verify for a %s', async (_label, admin) => {
    const harness = createHarness(admin);

    await expect(
      harness.service.login('owner', 'wrong-password', '127.0.0.1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(harness.verifyPassword).toHaveBeenCalledTimes(1);
    expect(harness.verifyPassword).toHaveBeenCalledWith(
      'dummy-hash',
      'wrong-password',
    );
    expect(harness.lease.recordFailure).toHaveBeenCalledTimes(1);
  });

  it('executes one real hash verify for an active administrator with a wrong password', async () => {
    const harness = createHarness(activeAdmin);

    await expect(
      harness.service.login('owner', 'wrong-password', '127.0.0.1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(harness.verifyPassword).toHaveBeenCalledTimes(1);
    expect(harness.verifyPassword).toHaveBeenCalledWith(
      'real-hash',
      'wrong-password',
    );
    expect(harness.lease.recordFailure).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['empty username', '', 'password'],
    ['overlong username', 'u'.repeat(101), 'password'],
    ['empty password', 'owner', ''],
    ['overlong password', 'owner', 'p'.repeat(257)],
  ])('rejects %s after one bounded dummy verify', async (
    _label,
    username,
    password,
  ) => {
    const harness = createHarness(activeAdmin);

    await expect(
      harness.service.login(username, password, '127.0.0.1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(harness.findUnique).not.toHaveBeenCalled();
    expect(harness.verifyPassword).toHaveBeenCalledTimes(1);
    expect(harness.verifyPassword).toHaveBeenCalledWith(
      'dummy-hash',
      expect.any(String),
    );
    expect(harness.verifyPassword.mock.calls[0]?.[1]).toHaveLength(0);
  });

  it('clears failures after a successful login', async () => {
    const harness = createHarness(activeAdmin);
    harness.verifyPassword.mockResolvedValue(true);

    await expect(
      harness.service.login('  owner  ', 'correct-password', '127.0.0.1'),
    ).resolves.toEqual({ accessToken: 'access-token' });

    expect(harness.findUnique).toHaveBeenCalledWith({
      where: { username: 'owner' },
    });
    expect(harness.lease.clearFailures).toHaveBeenCalledTimes(1);
    expect(harness.lease.recordFailure).not.toHaveBeenCalled();
    expect(harness.update).toHaveBeenCalled();
  });

  it('always releases the concurrent Argon2 lease', async () => {
    const harness = createHarness(activeAdmin);

    await expect(
      harness.service.login('owner', 'wrong-password', '127.0.0.1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(harness.lease.release).toHaveBeenCalledTimes(1);
  });
});
