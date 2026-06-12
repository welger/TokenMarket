import {
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { jest } from '@jest/globals';

import { UserJwtGuard } from './user-jwt.guard.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import { UserStatus } from '../generated/prisma/client.js';

function contextFor(authorization?: string) {
  const request: {
    headers: { authorization?: string };
    user?: unknown;
  } = { headers: { authorization } };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
  return { request, context };
}

describe('UserJwtGuard', () => {
  it('accepts an active user miniapp token', async () => {
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 'user_1',
        type: 'user',
      }),
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user_1',
          status: UserStatus.ACTIVE,
        }),
      },
    } as unknown as PrismaService;
    const guard = new UserJwtGuard(jwt as never, prisma);
    const { request, context } = contextFor('Bearer signed-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwt.verifyAsync).toHaveBeenCalledWith('signed-token', {
      algorithms: ['HS256'],
      issuer: 'multi-model-api-platform',
      audience: 'miniapp',
    });
    expect(request.user).toEqual({
      sub: 'user_1',
      type: 'user',
    });
  });

  it('rejects a disabled user even when the token is valid', async () => {
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 'user_1',
        type: 'user',
      }),
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user_1',
          status: UserStatus.SUSPENDED,
        }),
      },
    } as unknown as PrismaService;
    const guard = new UserJwtGuard(jwt as never, prisma);
    const { context } = contextFor('Bearer signed-token');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
