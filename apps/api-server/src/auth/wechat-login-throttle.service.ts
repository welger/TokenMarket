import { createHmac } from 'node:crypto';

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../common/config/env.schema.js';
import { RedisService } from '../risk/redis.service.js';

const WINDOW_MS = 60_000;
const WECHAT_LOGIN_RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return count
`;

class WechatLoginRateLimitedException extends HttpException {
  readonly code = 'RATE_LIMITED';

  constructor() {
    super(
      {
        code: 'RATE_LIMITED',
        message: 'WeChat login temporarily unavailable',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

class WechatLoginRateLimitUnavailableException extends HttpException {
  readonly code = 'RATE_LIMIT_UNAVAILABLE';

  constructor() {
    super(
      {
        code: 'RATE_LIMIT_UNAVAILABLE',
        message: 'WeChat login temporarily unavailable',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

@Injectable()
export class WechatLoginThrottleService {
  private readonly ipHashSecret: string;
  private readonly limit: number;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.ipHashSecret = config.get('AUDIT_IP_HASH_SECRET', { infer: true });
    this.limit = config.get('WECHAT_LOGIN_RATE_LIMIT_PER_MINUTE', {
      infer: true,
    });
  }

  async check(ip: string): Promise<void> {
    const ipHash = createHmac('sha256', this.ipHashSecret)
      .update(ip)
      .digest('hex');

    let result: unknown;
    try {
      result = await this.redis.eval(
        WECHAT_LOGIN_RATE_LIMIT_SCRIPT,
        [`auth:wechat-login:ip:${ipHash}`],
        [String(WINDOW_MS), String(this.limit)],
      );
    } catch {
      throw new WechatLoginRateLimitUnavailableException();
    }

    const count = Number(result);
    if (!Number.isInteger(count) || count < 1) {
      throw new WechatLoginRateLimitUnavailableException();
    }
    if (count > this.limit) {
      throw new WechatLoginRateLimitedException();
    }
  }
}
