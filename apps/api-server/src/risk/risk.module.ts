import { Module } from '@nestjs/common';

import { RateLimitService } from './rate-limit.service.js';
import { RedisService } from './redis.service.js';

@Module({
  providers: [RedisService, RateLimitService],
  exports: [RateLimitService, RedisService],
})
export class RiskModule {}
