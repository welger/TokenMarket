import {
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { jest } from '@jest/globals';

import { WechatAuthService } from './wechat-auth.service.js';
import type { WechatCodeExchange } from './wechat-code-exchange.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import { UserStatus } from '../generated/prisma/client.js';
import type { JwtService } from '@nestjs/jwt';

const activeUser = {
  id: 'user_1',
  status: UserStatus.ACTIVE,
};

function createHarness(
  user: typeof activeUser = activeUser,
) {
  const exchange = {
    exchange: jest.fn().mockResolvedValue({
      openId: 'openid_test_same-user',
    }),
  } as unknown as WechatCodeExchange;
  const upsert = jest.fn().mockResolvedValue(user);
  const prisma = {
    user: { upsert },
  } as unknown as PrismaService;
  const jwt = {
    signAsync: jest.fn().mockResolvedValue('miniapp-access-token'),
  } as unknown as JwtService;
  const service = new WechatAuthService(prisma, jwt, exchange);

  return { service, exchange, upsert, jwt };
}

describe('WechatAuthService', () => {
  it('reuses the same user for repeated logins with the same openId', async () => {
    const harness = createHarness();

    await expect(harness.service.login('test:same-user')).resolves.toEqual({
      accessToken: 'miniapp-access-token',
      userId: 'user_1',
    });
    await expect(harness.service.login('test:same-user')).resolves.toEqual({
      accessToken: 'miniapp-access-token',
      userId: 'user_1',
    });

    expect(harness.upsert).toHaveBeenCalledTimes(2);
    expect(harness.upsert).toHaveBeenCalledWith({
      where: { wechatOpenId: 'openid_test_same-user' },
      update: {},
      create: { wechatOpenId: 'openid_test_same-user' },
      select: { id: true, status: true },
    });
  });

  it('signs a user JWT with the miniapp audience explicitly', async () => {
    const harness = createHarness();

    await harness.service.login('test:same-user');

    expect(harness.jwt.signAsync).toHaveBeenCalledWith(
      { sub: 'user_1', type: 'user' },
      { audience: 'miniapp' },
    );
  });

  it.each([UserStatus.SUSPENDED, UserStatus.DELETED])(
    'rejects a %s user',
    async (status) => {
      const harness = createHarness({ ...activeUser, status });

      await expect(
        harness.service.login('test:disabled-user'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(harness.jwt.signAsync).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['missing code', undefined],
    ['non-string code', 123],
    ['empty code', '   '],
    ['overlong code', `test:${'a'.repeat(252)}`],
  ])('rejects %s without exchanging it', async (_label, code) => {
    const harness = createHarness();

    await expect(harness.service.login(code)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(harness.exchange.exchange).not.toHaveBeenCalled();
  });

  it('does not echo an invalid code in the error', async () => {
    const harness = createHarness();
    const privateCode = `test:${'private'.repeat(50)}`;

    await expect(harness.service.login(privateCode)).rejects.not.toThrow(
      privateCode,
    );
  });
});
