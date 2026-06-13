import type { INestApplication } from '@nestjs/common';

type ExpressApplication = {
  set(setting: string, value: unknown): unknown;
};

export function configureTrustedProxy(
  app: INestApplication,
  trustedProxyCidrs: readonly string[],
): void {
  if (!Array.isArray(trustedProxyCidrs)) {
    throw new Error('trusted proxy CIDRs must be a list');
  }

  const express = app.getHttpAdapter().getInstance() as ExpressApplication;
  express.set('trust proxy', [...trustedProxyCidrs]);
}
