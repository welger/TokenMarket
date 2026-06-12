import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { AppModule } from './app.module.js';
import type { EnvironmentVariables } from './common/config/env.schema.js';
import { configureTrustedProxy } from './common/http/configure-trusted-proxy.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService =
    app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

  configureTrustedProxy(
    app,
    configService.get('TRUST_PROXY_HOPS', { infer: true }),
  );
  app.enableShutdownHooks();
  await app.listen(configService.get('PORT', { infer: true }), '0.0.0.0');
}

void bootstrap();
