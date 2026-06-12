import {
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../common/config/env.schema.js';
import { RedisService } from './redis.service.js';

const WINDOW_MS = 60_000;
const RATE_LIMIT_SCRIPT = `
local exceeded = 0
local counts = {}

for index, key in ipairs(KEYS) do
  local count = redis.call('INCR', key)
  if count == 1 then
    redis.call('PEXPIRE', key, ARGV[1])
  end
  counts[index] = count
  if count > tonumber(ARGV[index + 1]) then
    exceeded = 1
  end
end

return {counts[1], counts[2], counts[3], exceeded}
`;

export class RateLimitedException extends HttpException {
  readonly code = 'RATE_LIMITED';

  constructor() {
    super(
      {
        code: 'RATE_LIMITED',
        message: '请求过于频繁，请稍后再试',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export class RateLimitUnavailableException extends HttpException {
  readonly code = 'RATE_LIMIT_UNAVAILABLE';

  constructor() {
    super(
      {
        code: 'RATE_LIMIT_UNAVAILABLE',
        message: '请求风控服务暂时不可用',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

export interface RateLimitIdentity {
  ipHash: string;
  userId: string;
  apiKeyId: string;
}

@Injectable()
export class RateLimitService {
  private readonly ipLimit: number;
  private readonly userLimit: number;
  private readonly keyLimit: number;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.ipLimit = config.get(
      'GATEWAY_IP_RATE_LIMIT_PER_MINUTE',
      { infer: true },
    );
    this.userLimit = config.get(
      'GATEWAY_USER_RATE_LIMIT_PER_MINUTE',
      { infer: true },
    );
    this.keyLimit = config.get(
      'GATEWAY_KEY_RATE_LIMIT_PER_MINUTE',
      { infer: true },
    );
  }

  async check(identity: RateLimitIdentity): Promise<void> {
    const result = await this.redis.eval(
      RATE_LIMIT_SCRIPT,
      [
        `gateway:rate:ip:${identity.ipHash}`,
        `gateway:rate:user:${identity.userId}`,
        `gateway:rate:key:${identity.apiKeyId}`,
      ],
      [
        String(WINDOW_MS),
        String(this.ipLimit),
        String(this.userLimit),
        String(this.keyLimit),
      ],
    );

    if (
      !Array.isArray(result) ||
      result.length !== 4 ||
      result.some((value) => !Number.isFinite(Number(value)))
    ) {
      throw new RateLimitUnavailableException();
    }
    if (Number(result[3]) === 1) {
      throw new RateLimitedException();
    }
  }
}
