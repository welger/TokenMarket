import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { configureTrustedProxy } from '../src/common/http/configure-trusted-proxy.js';

interface ExpressSettings {
  get(name: string): unknown;
}

async function createProbeApp(
  trustedProxyCidrs: string[],
): Promise<INestApplication> {
  const module = await Test.createTestingModule({}).compile();
  const app = module.createNestApplication({ logger: false });
  configureTrustedProxy(app, trustedProxyCidrs);
  return app;
}

describe('trusted proxy configuration (e2e)', () => {
  it('rejects the removed numeric hop configuration', async () => {
    const module = await Test.createTestingModule({}).compile();
    const app = module.createNestApplication({ logger: false });

    try {
      expect(() =>
        configureTrustedProxy(app, 1 as never),
      ).toThrow('trusted proxy CIDRs must be a list');
    } finally {
      await app.close();
    }
  });

  it('does not trust any proxy with the default empty list', async () => {
    const app = await createProbeApp([]);
    try {
      const express = app.getHttpAdapter().getInstance() as ExpressSettings;
      const trust = express.get('trust proxy fn') as (
        address: string,
        index: number,
      ) => boolean;

      expect(trust('127.0.0.1', 0)).toBe(false);
      expect(trust('::1', 0)).toBe(false);
      expect(trust('203.0.113.42', 0)).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('trusts only IPv4 and IPv6 loopback when configured', async () => {
    const app = await createProbeApp(['loopback']);
    try {
      const express = app.getHttpAdapter().getInstance() as ExpressSettings;
      const trust = express.get('trust proxy fn') as (
        address: string,
        index: number,
      ) => boolean;

      expect(trust('127.0.0.1', 0)).toBe(true);
      expect(trust('::1', 0)).toBe(true);
      expect(trust('203.0.113.42', 0)).toBe(false);
    } finally {
      await app.close();
    }
  });
});
