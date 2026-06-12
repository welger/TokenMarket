import { BadRequestException, Injectable } from '@nestjs/common';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import {
  ProviderStatus,
  type Provider,
  type Prisma,
} from '../generated/prisma/client.js';

export interface ProviderWriteInput {
  name?: unknown;
  displayName?: unknown;
  configRef?: unknown;
  disclosurePurpose?: unknown;
  region?: unknown;
  status?: unknown;
  routingPriority?: unknown;
  apiKey?: unknown;
  upstreamApiKey?: unknown;
  secret?: unknown;
}

@Injectable()
export class ProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  listAdmin() {
    return this.prisma.provider.findMany({
      orderBy: [
        { routingPriority: 'asc' },
        { displayName: 'asc' },
      ],
    });
  }

  create(
    adminUserId: string,
    input: ProviderWriteInput,
  ): Promise<Provider> {
    const data = this.parseWriteInput(
      input,
      true,
    ) as Prisma.ProviderUncheckedCreateInput;
    return this.auditService.runInAuditedTransaction(
      {
        adminUserId,
        action: 'PROVIDER_CREATED',
        resourceType: 'provider',
      },
      async ({ transaction, setAfterSummary }) => {
        const created = await transaction.provider.create({ data });
        await this.disableProduction(transaction);
        setAfterSummary({
          id: created.id,
          name: created.name,
          region: created.region,
          status: created.status,
        });
        return created;
      },
    );
  }

  update(
    adminUserId: string,
    id: string,
    input: ProviderWriteInput,
  ): Promise<Provider> {
    const data = this.parseWriteInput(
      input,
      false,
    ) as Prisma.ProviderUncheckedUpdateInput;
    return this.auditService.runInAuditedTransaction(
      {
        adminUserId,
        action: 'PROVIDER_UPDATED',
        resourceType: 'provider',
        resourceId: id,
      },
      async ({
        transaction,
        setBeforeSummary,
        setAfterSummary,
      }) => {
        const before = await transaction.provider.findUniqueOrThrow({
          where: { id },
        });
        const updated = await transaction.provider.update({
          where: { id },
          data,
        });
        await this.disableProduction(transaction);
        setBeforeSummary({
          displayName: before.displayName,
          region: before.region,
          status: before.status,
        });
        setAfterSummary({
          displayName: updated.displayName,
          region: updated.region,
          status: updated.status,
        });
        return updated;
      },
    );
  }

  private parseWriteInput(
    input: ProviderWriteInput,
    requireAll: boolean,
  ): Record<string, unknown> {
    if (
      input.apiKey !== undefined ||
      input.upstreamApiKey !== undefined ||
      input.secret !== undefined
    ) {
      throw new BadRequestException(
        'Provider secrets must be configured in the server environment',
      );
    }

    const data: Record<string, unknown> = {};
    for (const key of [
      'name',
      'displayName',
      'configRef',
      'disclosurePurpose',
      'region',
    ] as const) {
      const value = input[key];
      if (value === undefined && !requireAll) {
        continue;
      }
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new BadRequestException(`Invalid ${key}`);
      }
      const normalized = value.trim();
      if (
        key === 'configRef' &&
        !/^env:[A-Z][A-Z0-9_]{2,127}$/.test(normalized)
      ) {
        throw new BadRequestException('Invalid configRef');
      }
      data[key] = normalized;
    }

    if (input.status !== undefined) {
      if (
        !Object.values(ProviderStatus).includes(
          input.status as ProviderStatus,
        )
      ) {
        throw new BadRequestException('Invalid provider status');
      }
      data.status = input.status;
    } else if (requireAll) {
      data.status = ProviderStatus.ACTIVE;
    }

    if (input.routingPriority !== undefined) {
      if (
        typeof input.routingPriority !== 'number' ||
        !Number.isInteger(input.routingPriority) ||
        input.routingPriority < 0
      ) {
        throw new BadRequestException('Invalid routingPriority');
      }
      data.routingPriority = input.routingPriority;
    }
    if (!requireAll && Object.keys(data).length === 0) {
      throw new BadRequestException(
        'At least one provider field is required',
      );
    }
    return data;
  }

  private async disableProduction(
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    await transaction.complianceProfile.updateMany({
      where: {
        profileKey: 'default',
        productionEnabled: true,
      },
      data: { productionEnabled: false },
    });
  }
}
