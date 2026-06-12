import { BadRequestException } from '@nestjs/common';

import { ProvidersService } from './providers.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';

describe('ProvidersService', () => {
  it('rejects an empty update', () => {
    const service = new ProvidersService(
      {} as PrismaService,
      {} as AuditService,
    );

    expect(() => service.update('admin_1', 'provider_1', {})).toThrow(
      'At least one provider field is required',
    );
  });

  it('rejects provider secrets in API input', async () => {
    const service = new ProvidersService(
      {} as PrismaService,
      {} as AuditService,
    );

    expect(() =>
      service.create('admin_1', {
        name: 'provider',
        displayName: 'Provider',
        configRef: 'UPSTREAM_API_KEY',
        disclosurePurpose: '模型推理',
        region: '中国大陆',
        apiKey: 'must-not-be-accepted',
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects a configRef that is not an environment reference', () => {
    const service = new ProvidersService(
      {} as PrismaService,
      {} as AuditService,
    );

    expect(() =>
      service.create('admin_1', {
        name: 'provider',
        displayName: 'Provider',
        configRef: 'plain-secret-value',
        disclosurePurpose: '模型推理',
        region: '中国大陆',
      }),
    ).toThrow('Invalid configRef');
  });
});
