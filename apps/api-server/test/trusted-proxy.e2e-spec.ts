import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { configureTrustedProxy } from '../src/common/http/configure-trusted-proxy.js';

interface ExpressSettings {
  get(name: string): unknown;
}

async function createProbeApp(hops: number): Promise<INestApplication> {
  const module = await Test.createTestingModule({}).compile();
  const app = module.createNestApplication({ logger: false });
  configureTrustedProxy(app, hops);
  return app;
}

describe('trusted proxy configuration (e2e)', () => {
  it('does not trust X-Forwarded-For with the default zero hops', async () => {
    const app = await createProbeApp(0);
    try {
      const express = app.getHttpAdapter().getInstance() as ExpressSettings;
      const trust = express.get('trust proxy fn') as (
        address: string,
        index: number,
      ) => boolean;

      expect(trust('127.0.0.1', 0)).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('trusts one proxy hop when explicitly configured', async () => {
    const app = await createProbeApp(1);
    try {
      const express = app.getHttpAdapter().getInstance() as ExpressSettings;
      const trust = express.get('trust proxy fn') as (
        address: string,
        index: number,
      ) => boolean;

      expect(trust('127.0.0.1', 0)).toBe(true);
      expect(trust('203.0.113.42', 1)).toBe(false);
    } finally {
      await app.close();
    }
  });
});
