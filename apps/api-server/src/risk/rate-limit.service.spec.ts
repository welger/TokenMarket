import { HttpException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { RateLimitService } from './rate-limit.service.js';
import type { RedisService } from './redis.service.js';

function createHarness(result: number[]) {
  const redis = {
    eval: jest.fn().mockResolvedValue(result),
  } as unknown as RedisService;
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, number> = {
        GATEWAY_IP_RATE_LIMIT_PER_MINUTE: 120,
        GATEWAY_USER_RATE_LIMIT_PER_MINUTE: 60,
        GATEWAY_KEY_RATE_LIMIT_PER_MINUTE: 60,
      };
      return values[key];
    }),
  };
  return {
    service: new RateLimitService(redis, config as never),
    redis: redis as unknown as { eval: jest.Mock },
  };
}

describe('RateLimitService', () => {
  it('increments all dimensions atomically without plaintext credentials', async () => {
    const harness = createHarness([1, 1, 1, 0]);

    await expect(
      harness.service.check({
        ipHash: 'hashed-ip',
        userId: 'user_1',
        apiKeyId: 'key_1',
      }),
    ).resolves.toBeUndefined();
    expect(harness.redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      [
        'gateway:rate:ip:hashed-ip',
        'gateway:rate:user:user_1',
        'gateway:rate:key:key_1',
      ],
      ['60000', '120', '60', '60'],
    );
    expect(
      JSON.stringify(harness.redis.eval.mock.calls),
    ).not.toContain('sk-gw_');
  });

  it('rejects when any dimension exceeds its limit', async () => {
    const harness = createHarness([121, 1, 1, 1]);

    await expect(
      harness.service.check({
        ipHash: 'hashed-ip',
        userId: 'user_1',
        apiKeyId: 'key_1',
      }),
    ).rejects.toMatchObject<Partial<HttpException> & { code: string }>({
      code: 'RATE_LIMITED',
      status: 429,
    });
  });

  it('fails closed when Redis returns an invalid script result', async () => {
    const harness = createHarness([]);

    await expect(
      harness.service.check({
        ipHash: 'hashed-ip',
        userId: 'user_1',
        apiKeyId: 'key_1',
      }),
    ).rejects.toMatchObject<Partial<HttpException> & { code: string }>({
      code: 'RATE_LIMIT_UNAVAILABLE',
      status: 503,
    });
  });
});
