import {
  GLOBAL_MODULE_METADATA,
  MODULE_METADATA,
} from '@nestjs/common/constants';

import { PrismaModule } from './prisma.module.js';
import { PrismaService } from './prisma.service.js';

const originalEnvironment = { ...process.env };

Object.assign(process.env, {
  DATABASE_URL: 'postgresql://gateway:gateway_local@127.0.0.1:5432/gateway',
  REDIS_URL: 'redis://127.0.0.1:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  API_KEY_PEPPER: 'b'.repeat(32),
  UPSTREAM_BASE_URL: 'http://127.0.0.1:4010/v1',
  PAYMENT_DRIVER: 'test',
});

const { AppModule } = await import('../../app.module.js');

describe('PrismaModule', () => {
  afterAll(() => {
    process.env = originalEnvironment;
  });

  it('is global and exports PrismaService', () => {
    expect(Reflect.getMetadata(GLOBAL_MODULE_METADATA, PrismaModule)).toBe(true);
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, PrismaModule),
    ).toContain(PrismaService);
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, PrismaModule)).toContain(
      PrismaService,
    );
  });

  it('is imported by AppModule without directly registering PrismaService', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule)).toContain(
      PrismaModule,
    );
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule) ?? [],
    ).not.toContain(PrismaService);
    expect(
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, AppModule) ?? [],
    ).not.toContain(PrismaService);
  });
});
