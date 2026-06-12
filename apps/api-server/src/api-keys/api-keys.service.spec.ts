import {
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { jest } from '@jest/globals';

import {
  ApiKeyAuthCache,
  ApiKeysService,
} from './api-keys.service.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import {
  ApiKeyStatus,
  UserStatus,
} from '../generated/prisma/client.js';

const pepper = 'local-test-pepper-that-is-at-least-32-bytes';

function createHarness() {
  const createdAt = new Date('2026-06-12T00:00:00.000Z');
  const stored = {
    id: 'key_1',
    userId: 'user_1',
    name: '开发环境',
    prefix: 'sk-gw_key_1',
    lastFour: 'ABCD',
    secretHash: 'a'.repeat(64),
    status: ApiKeyStatus.ACTIVE,
    createdAt,
    disabledAt: null,
  };
  const transaction = {
    apiKey: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...stored, ...data }),
      ),
    },
  };
  const prisma = {
    $transaction: jest.fn(
      async (
        operation: (client: typeof transaction) => Promise<unknown>,
      ) => operation(transaction),
    ),
    apiKey: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: stored.id,
          name: stored.name,
          prefix: stored.prefix,
          lastFour: stored.lastFour,
          status: stored.status,
          createdAt,
          disabledAt: null,
        },
      ]),
      findUnique: jest.fn().mockResolvedValue({
        ...stored,
        user: {
          id: 'user_1',
          status: UserStatus.ACTIVE,
        },
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(stored),
    },
  } as unknown as PrismaService;
  const config = {
    get: jest.fn().mockReturnValue(pepper),
  };
  const cache = {
    get: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    invalidateKey: jest.fn(),
  } as unknown as ApiKeyAuthCache;

  return {
    service: new ApiKeysService(prisma, config as never, cache),
    prisma: prisma as unknown as {
      apiKey: {
        findMany: jest.Mock;
        findUnique: jest.Mock;
        updateMany: jest.Mock;
        findFirst: jest.Mock;
      };
    },
    transaction,
    cache,
  };
}

describe('ApiKeysService', () => {
  it('returns plaintext only when creating a key', async () => {
    const harness = createHarness();
    const created = await harness.service.create(
      'user_1',
      ' 开发环境 ',
    );

    expect(created.plaintext).toMatch(
      /^sk-gw_[0-9a-f-]{36}_[A-Za-z0-9_-]{43}$/,
    );
    expect(
      harness.transaction.apiKey.create,
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user_1',
        name: '开发环境',
        secretHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      select: expect.not.objectContaining({
        secretHash: true,
      }),
    });
    expect(
      harness.transaction.apiKey.create.mock.calls[0]?.[0],
    ).not.toHaveProperty('data.plaintext');

    const listed = await harness.service.list('user_1');
    expect(listed[0]).not.toHaveProperty('plaintext');
    expect(listed[0]).not.toHaveProperty('secretHash');
    expect(listed[0]).not.toHaveProperty('disabledAt');
    expect(listed[0]?.masked).toBe('sk-gw_key_1_****ABCD');
    expect(harness.prisma.apiKey.findMany).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastFour: true,
        status: true,
        createdAt: true,
        disabledAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('limits each user to ten active keys', async () => {
    const harness = createHarness();
    harness.transaction.apiKey.count.mockResolvedValue(10);

    await expect(
      harness.service.create('user_1', '第十一个 Key'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(harness.transaction.apiKey.create).not.toHaveBeenCalled();
  });

  it('disables only the owner key and immediately invalidates cache', async () => {
    const harness = createHarness();

    await expect(
      harness.service.disable('user_1', 'key_1'),
    ).resolves.toMatchObject({
      id: 'key_1',
      status: ApiKeyStatus.DISABLED,
    });
    expect(harness.prisma.apiKey.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'key_1',
        userId: 'user_1',
        status: ApiKeyStatus.ACTIVE,
      },
      data: {
        status: ApiKeyStatus.DISABLED,
        disabledAt: expect.any(Date),
      },
    });
    expect(harness.cache.invalidateKey).toHaveBeenCalledWith('key_1');
  });

  it('rejects a disabled key during authentication', async () => {
    const harness = createHarness();
    harness.prisma.apiKey.findUnique.mockResolvedValue({
      id: 'key_1',
      secretHash: 'a'.repeat(64),
      status: ApiKeyStatus.DISABLED,
      user: {
        id: 'user_1',
        status: UserStatus.ACTIVE,
      },
    });

    await expect(
      harness.service.authenticate(
        `sk-gw_key_1_${'a'.repeat(43)}`,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not let a cached identity bypass current database status', async () => {
    const harness = createHarness();
    (
      harness.cache.get as jest.Mock
    ).mockReturnValue({
      apiKeyId: 'key_1',
      userId: 'user_1',
    });
    harness.prisma.apiKey.findUnique.mockResolvedValue({
      id: 'key_1',
      userId: 'user_1',
      secretHash: 'a'.repeat(64),
      status: ApiKeyStatus.ACTIVE,
      user: {
        id: 'user_1',
        status: UserStatus.SUSPENDED,
      },
    });

    await expect(
      harness.service.authenticate(
        `sk-gw_key_1_${'a'.repeat(43)}`,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
