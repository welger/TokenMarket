import { jest } from '@jest/globals';

import { ModelsService } from './models.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import {
  ModelStatus,
  ProviderStatus,
} from '../generated/prisma/client.js';

describe('ModelsService', () => {
  it('rejects an empty update', () => {
    const service = new ModelsService(
      {} as PrismaService,
      {} as AuditService,
    );

    expect(() => service.update('admin_1', 'model_1', {})).toThrow(
      'At least one model field is required',
    );
  });

  it('publishes only available models from active providers', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      model: { findMany },
    } as unknown as PrismaService;
    const service = new ModelsService(prisma, {} as AuditService);

    await service.listPublic();

    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: ModelStatus.AVAILABLE,
        provider: { status: ProviderStatus.ACTIVE },
      },
      select: {
        id: true,
        name: true,
        displayName: true,
        description: true,
        capabilities: true,
        inputUnit: true,
        outputUnit: true,
        contextWindow: true,
        inputMultiplier: true,
        outputMultiplier: true,
        status: true,
        provider: {
          select: {
            displayName: true,
            disclosurePurpose: true,
            region: true,
          },
        },
      },
      orderBy: [
        { routingPriority: 'asc' },
        { displayName: 'asc' },
      ],
    });
  });
});
