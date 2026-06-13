import { createHmac } from 'node:crypto';

import { HttpException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { WechatLoginThrottleService } from './wechat-login-throttle.service.js';
import type { EnvironmentVariables } from '../common/config/env.schema.js';
import type { RedisService } from '../risk/redis.service.js';
import type { ConfigService } from '@nestjs/config';

const ipHashSecret = 'h'.repeat(32);

function createHarness(result: unknown = 1) {
  const redis = {
    eval: jest.fn().mockResolvedValue(result),
  } as unknown as RedisService;
  const config = {
    get: jest.fn((key: keyof EnvironmentVariables) => {
      const values = {
        AUDIT_IP_HASH_SECRET: ipHashSecret,
        WECHAT_LOGIN_RATE_LIMIT_PER_MINUTE: 30,
      };
      return values[key as keyof typeof values];
    }),
  } as unknown as ConfigService<EnvironmentVariables, true>;

  return {
    service: new WechatLoginThrottleService(redis, config),
    redis: redis as unknown as { eval: jest.Mock },
  };
}

async function captureError(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
  } catch (error) {
    return error;
  }

  throw new Error('Expected operation to fail');
}

describe('WechatLoginThrottleService', () => {
  it('uses an HMAC of the IP in one atomic fixed-window Redis script', async () => {
    const harness = createHarness();
    const privateIp = '203.0.113.42';
    const expectedHash = createHmac('sha256', ipHashSecret)
      .update(privateIp)
      .digest('hex');

    await expect(harness.service.check(privateIp)).resolves.toBeUndefined();

    expect(harness.redis.eval).toHaveBeenCalledWith(
      expect.stringMatching(
        /redis\.call\('INCR', KEYS\[1\]\)[\s\S]*redis\.call\('PEXPIRE', KEYS\[1\], ARGV\[1\]\)/,
      ),
      [`auth:wechat-login:ip:${expectedHash}`],
      ['60000', '30'],
    );
    const redisCall = JSON.stringify(harness.redis.eval.mock.calls);
    expect(redisCall).not.toContain(privateIp);
    expect(redisCall).not.toContain('test:');
  });

  it('returns 429 without leaking the IP or login code when the limit is exceeded', async () => {
    const harness = createHarness(31);
    const privateIp = '203.0.113.43';
    const privateCode = 'test:private-login-code';

    const error = await captureError(harness.service.check(privateIp));

    expect(error).toMatchObject<Partial<HttpException>>({ status: 429 });
    expect((error as HttpException).getResponse()).toMatchObject({
      code: 'RATE_LIMITED',
    });
    const publicError = JSON.stringify(error);
    expect(publicError).not.toContain(privateIp);
    expect(publicError).not.toContain(privateCode);
  });

  it('fails closed with 503 when Redis throws', async () => {
    const harness = createHarness();
    const privateIp = '203.0.113.44';
    const privateRedisDetail = `redis unavailable for ${privateIp}`;
    harness.redis.eval.mockRejectedValueOnce(
      new Error(privateRedisDetail),
    );

    const error = await captureError(harness.service.check(privateIp));

    expect(error).toMatchObject<Partial<HttpException>>({ status: 503 });
    expect((error as HttpException).getResponse()).toMatchObject({
      code: 'RATE_LIMIT_UNAVAILABLE',
    });
    const publicError = JSON.stringify(error);
    expect(publicError).not.toContain(privateIp);
    expect(publicError).not.toContain(privateRedisDetail);
  });

  it('fails closed with 503 when Redis returns an invalid result', async () => {
    const privateInvalidResult = 'private-invalid-redis-result';
    const harness = createHarness(privateInvalidResult);

    const error = await captureError(
      harness.service.check('203.0.113.45'),
    );

    expect(error).toMatchObject<Partial<HttpException>>({ status: 503 });
    expect((error as HttpException).getResponse()).toMatchObject({
      code: 'RATE_LIMIT_UNAVAILABLE',
    });
    expect(JSON.stringify(error)).not.toContain(privateInvalidResult);
  });
});
