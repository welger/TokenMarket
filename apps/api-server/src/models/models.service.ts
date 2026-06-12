import { BadRequestException, Injectable } from '@nestjs/common';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import {
  BillingUnit,
  ModelStatus,
  ProviderStatus,
  type Model,
  type Prisma,
} from '../generated/prisma/client.js';

export interface ModelWriteInput {
  providerId?: unknown;
  name?: unknown;
  upstreamModel?: unknown;
  displayName?: unknown;
  description?: unknown;
  capabilities?: unknown;
  contextWindow?: unknown;
  inputMultiplier?: unknown;
  outputMultiplier?: unknown;
  routingPriority?: unknown;
  status?: unknown;
}

@Injectable()
export class ModelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  listPublic() {
    return this.prisma.model.findMany({
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
        { routingPriority: 'asc' as const },
        { displayName: 'asc' as const },
      ],
    });
  }

  listAdmin() {
    return this.prisma.model.findMany({
      include: { provider: true },
      orderBy: [
        { routingPriority: 'asc' as const },
        { displayName: 'asc' as const },
      ],
    });
  }

  create(
    adminUserId: string,
    input: ModelWriteInput,
  ): Promise<Model> {
    const data = this.parseWriteInput(
      input,
      true,
    ) as Prisma.ModelUncheckedCreateInput;
    return this.auditService.runInAuditedTransaction(
      {
        adminUserId,
        action: 'MODEL_CREATED',
        resourceType: 'model',
      },
      async ({ transaction, setAfterSummary }) => {
        const created = await transaction.model.create({ data });
        await this.disableProduction(transaction);
        setAfterSummary({
          id: created.id,
          name: created.name,
          status: created.status,
        });
        return created;
      },
    );
  }

  update(
    adminUserId: string,
    id: string,
    input: ModelWriteInput,
  ): Promise<Model> {
    const data = this.parseWriteInput(
      input,
      false,
    ) as Prisma.ModelUncheckedUpdateInput;
    return this.auditService.runInAuditedTransaction(
      {
        adminUserId,
        action: 'MODEL_UPDATED',
        resourceType: 'model',
        resourceId: id,
      },
      async ({
        transaction,
        setBeforeSummary,
        setAfterSummary,
      }) => {
        const before = await transaction.model.findUniqueOrThrow({
          where: { id },
        });
        const updated = await transaction.model.update({
          where: { id },
          data,
        });
        await this.disableProduction(transaction);
        setBeforeSummary({
          name: before.name,
          status: before.status,
          routingPriority: before.routingPriority,
        });
        setAfterSummary({
          name: updated.name,
          status: updated.status,
          routingPriority: updated.routingPriority,
        });
        return updated;
      },
    );
  }

  private parseWriteInput(
    input: ModelWriteInput,
    requireAll: boolean,
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    this.assignText(data, 'providerId', input.providerId, requireAll);
    this.assignText(data, 'name', input.name, requireAll);
    this.assignText(
      data,
      'upstreamModel',
      input.upstreamModel,
      requireAll,
    );
    this.assignText(
      data,
      'displayName',
      input.displayName,
      requireAll,
    );
    this.assignText(
      data,
      'description',
      input.description,
      requireAll,
    );
    if (input.capabilities !== undefined) {
      if (
        !Array.isArray(input.capabilities) ||
        input.capabilities.length > 20 ||
        input.capabilities.some(
          (capability) =>
            typeof capability !== 'string' ||
            capability.trim().length === 0 ||
            capability.length > 50,
        )
      ) {
        throw new BadRequestException('Invalid capabilities');
      }
      data.capabilities = [
        ...new Set(
          input.capabilities.map((capability) => capability.trim()),
        ),
      ];
    } else if (requireAll) {
      data.capabilities = [];
    }
    this.assignInteger(
      data,
      'contextWindow',
      input.contextWindow,
      requireAll,
      1,
    );
    this.assignNumber(
      data,
      'inputMultiplier',
      input.inputMultiplier,
      requireAll,
      0,
    );
    this.assignNumber(
      data,
      'outputMultiplier',
      input.outputMultiplier,
      requireAll,
      0,
    );
    this.assignInteger(
      data,
      'routingPriority',
      input.routingPriority,
      false,
      0,
    );

    if (input.status !== undefined) {
      if (!Object.values(ModelStatus).includes(input.status as ModelStatus)) {
        throw new BadRequestException('Invalid model status');
      }
      data.status = input.status;
    } else if (requireAll) {
      data.status = ModelStatus.UNAVAILABLE;
    }
    if (requireAll) {
      data.inputUnit = BillingUnit.CHARACTER;
      data.outputUnit = BillingUnit.CHARACTER;
    } else if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        'At least one model field is required',
      );
    }
    return data;
  }

  private assignText(
    data: Record<string, unknown>,
    key: string,
    value: unknown,
    required: boolean,
  ): void {
    if (value === undefined && !required) {
      return;
    }
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`Invalid ${key}`);
    }
    data[key] = value.trim();
  }

  private assignInteger(
    data: Record<string, unknown>,
    key: string,
    value: unknown,
    required: boolean,
    minimum: number,
  ): void {
    if (value === undefined && !required) {
      return;
    }
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < minimum
    ) {
      throw new BadRequestException(`Invalid ${key}`);
    }
    data[key] = value;
  }

  private assignNumber(
    data: Record<string, unknown>,
    key: string,
    value: unknown,
    required: boolean,
    minimum: number,
  ): void {
    if (value === undefined && !required) {
      return;
    }
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < minimum
    ) {
      throw new BadRequestException(`Invalid ${key}`);
    }
    data[key] = value;
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
