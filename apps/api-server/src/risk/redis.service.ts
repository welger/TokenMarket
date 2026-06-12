import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

import type { EnvironmentVariables } from '../common/config/env.schema.js';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: ReturnType<typeof createClient>;

  constructor(
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.client = createClient({
      url: config.get('REDIS_URL', { infer: true }),
    });
    this.client.on('error', () => {
      this.logger.error('Redis client error');
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  eval(
    script: string,
    keys: string[],
    args: string[],
  ): Promise<unknown> {
    return this.client.eval(script, {
      keys,
      arguments: args,
    });
  }

  rPush(key: string, value: string): Promise<number> {
    return this.client.rPush(key, value);
  }
}
