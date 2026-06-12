import type { INestApplication } from '@nestjs/common';

type ExpressApplication = {
  set(setting: string, value: unknown): unknown;
};

export function configureTrustedProxy(
  app: INestApplication,
  hops: number,
): void {
  const express = app.getHttpAdapter().getInstance() as ExpressApplication;
  express.set('trust proxy', hops);
}
