import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { AdminJwtGuard } from './admin-jwt.guard.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import {
  AdminRole,
  AdminUserStatus,
} from '../generated/prisma/client.js';

const secret = 'jwt-test-secret-not-for-production-123456';
const payload = {
  sub: 'admin_1',
  role: AdminRole.OWNER,
  type: 'admin' as const,
};

function createGuard() {
  const jwt = new JwtService({ secret });
  const prisma = {
    adminUser: {
      findUnique: async () => ({
        id: 'admin_1',
        role: AdminRole.OWNER,
        status: AdminUserStatus.ACTIVE,
      }),
    },
  } as unknown as PrismaService;
  const guard = new AdminJwtGuard(jwt, prisma);
  return { guard, jwt };
}

function contextFor(token: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { authorization: `Bearer ${token}` },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('AdminJwtGuard JWT constraints', () => {
  it.each([
    [
      'HS384',
      {
        algorithm: 'HS384' as const,
        issuer: 'multi-model-api-platform',
        audience: 'admin-console',
      },
    ],
    [
      'wrong issuer',
      {
        algorithm: 'HS256' as const,
        issuer: 'other-platform',
        audience: 'admin-console',
      },
    ],
    [
      'wrong audience',
      {
        algorithm: 'HS256' as const,
        issuer: 'multi-model-api-platform',
        audience: 'other-console',
      },
    ],
  ])('rejects a token with %s', async (_label, options) => {
    const { guard, jwt } = createGuard();
    const token = jwt.sign(payload, options);

    await expect(guard.canActivate(contextFor(token))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accepts HS256 with the fixed issuer and audience', async () => {
    const { guard, jwt } = createGuard();
    const token = jwt.sign(payload, {
      algorithm: 'HS256',
      issuer: 'multi-model-api-platform',
      audience: 'admin-console',
    });

    await expect(guard.canActivate(contextFor(token))).resolves.toBe(true);
  });
});
