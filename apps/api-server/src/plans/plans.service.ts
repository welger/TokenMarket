import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import {
  PlanActivationMode,
  PlanStatus,
  type Prisma,
} from '../generated/prisma/client.js';

export interface PlanWriteInput {
  name?: unknown;
  description?: unknown;
  priceMinor?: unknown;
  currency?: unknown;
  inputQuota?: unknown;
  outputQuota?: unknown;
  unifiedQuota?: unknown;
  activationMode?: unknown;
  validityDays?: unknown;
  refundPolicy?: unknown;
  purchaseNotice?: unknown;
  status?: unknown;
  modelIds?: unknown;
}

interface NormalizedPlan {
  name: string;
  description: string;
  priceMinor: number;
  currency: string;
  inputQuota: bigint | null;
  outputQuota: bigint | null;
  unifiedQuota: bigint | null;
  activationMode: PlanActivationMode;
  validityDays: number;
  refundPolicy: string;
  purchaseNotice: string;
  status: PlanStatus;
  modelIds: string[];
}

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listPublic() {
    const plans = await this.prisma.plan.findMany({
      where: { status: PlanStatus.ACTIVE },
      include: {
        models: {
          select: { id: true, name: true, displayName: true },
        },
      },
      orderBy: [{ priceMinor: 'asc' }, { createdAt: 'asc' }],
    });
    return plans.map((plan) => this.toPublicPlan(plan));
  }

  listAdmin() {
    return this.prisma.plan.findMany({
      include: { models: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  create(adminUserId: string, input: PlanWriteInput) {
    const normalized = this.normalizeCreate(input);
    return this.auditService.runInAuditedTransaction(
      {
        adminUserId,
        action: 'PLAN_CREATED',
        resourceType: 'plan',
      },
      async ({ transaction, setAfterSummary }) => {
        await this.assertModelsExist(transaction, normalized.modelIds);
        const created = await transaction.plan.create({
          data: {
            ...this.planData(normalized),
            models: {
              connect: normalized.modelIds.map((id) => ({ id })),
            },
          },
          include: { models: true },
        });
        await this.disableProduction(transaction);
        setAfterSummary({
          id: created.id,
          name: created.name,
          priceMinor: created.priceMinor,
          status: created.status,
        });
        return created;
      },
    );
  }

  update(
    adminUserId: string,
    planId: string,
    input: PlanWriteInput,
  ) {
    if (Object.values(input).every((value) => value === undefined)) {
      throw new BadRequestException(
        'At least one plan field is required',
      );
    }
    return this.auditService.runInAuditedTransaction(
      {
        adminUserId,
        action: 'PLAN_UPDATED',
        resourceType: 'plan',
        resourceId: planId,
      },
      async ({
        transaction,
        setBeforeSummary,
        setAfterSummary,
      }) => {
        const before = await transaction.plan.findUniqueOrThrow({
          where: { id: planId },
          include: { models: { select: { id: true } } },
        });
        const normalized = this.normalizeCreate({
          name: input.name ?? before.name,
          description: input.description ?? before.description,
          priceMinor: input.priceMinor ?? before.priceMinor,
          currency: input.currency ?? before.currency,
          inputQuota:
            input.inputQuota !== undefined
              ? input.inputQuota
              : before.inputQuota,
          outputQuota:
            input.outputQuota !== undefined
              ? input.outputQuota
              : before.outputQuota,
          unifiedQuota:
            input.unifiedQuota !== undefined
              ? input.unifiedQuota
              : before.unifiedQuota,
          activationMode:
            input.activationMode ?? before.activationMode,
          validityDays: input.validityDays ?? before.validityDays,
          refundPolicy: input.refundPolicy ?? before.refundPolicy,
          purchaseNotice:
            input.purchaseNotice ?? before.purchaseNotice,
          status: input.status ?? before.status,
          modelIds:
            input.modelIds ?? before.models.map((model) => model.id),
        });
        await this.assertModelsExist(transaction, normalized.modelIds);
        const updated = await transaction.plan.update({
          where: { id: planId },
          data: {
            ...this.planData(normalized),
            models: {
              set: normalized.modelIds.map((id) => ({ id })),
            },
          },
          include: { models: true },
        });
        await this.disableProduction(transaction);
        setBeforeSummary({
          name: before.name,
          priceMinor: before.priceMinor,
          status: before.status,
        });
        setAfterSummary({
          name: updated.name,
          priceMinor: updated.priceMinor,
          status: updated.status,
        });
        return updated;
      },
    );
  }

  private normalizeCreate(input: PlanWriteInput): NormalizedPlan {
    const inputQuota = this.optionalQuota(
      input.inputQuota,
      'inputQuota',
    );
    const outputQuota = this.optionalQuota(
      input.outputQuota,
      'outputQuota',
    );
    const unifiedQuota = this.optionalQuota(
      input.unifiedQuota,
      'unifiedQuota',
    );
    if (
      (unifiedQuota !== null &&
        (inputQuota !== null || outputQuota !== null)) ||
      (unifiedQuota === null &&
        inputQuota === null &&
        outputQuota === null)
    ) {
      throw new BadRequestException(
        'Use either unifiedQuota or input/output quotas',
      );
    }

    const currency = this.requiredText(input.currency, 'currency', 3)
      .toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new BadRequestException('Invalid currency');
    }
    const activationMode = input.activationMode as PlanActivationMode;
    if (!Object.values(PlanActivationMode).includes(activationMode)) {
      throw new BadRequestException('Invalid activationMode');
    }
    const status = input.status as PlanStatus;
    if (!Object.values(PlanStatus).includes(status)) {
      throw new BadRequestException('Invalid plan status');
    }

    return {
      name: this.requiredText(input.name, 'name', 200),
      description: this.requiredText(
        input.description,
        'description',
        2000,
      ),
      priceMinor: this.requiredInteger(
        input.priceMinor,
        'priceMinor',
        0,
      ),
      currency,
      inputQuota,
      outputQuota,
      unifiedQuota,
      activationMode,
      validityDays: this.requiredInteger(
        input.validityDays,
        'validityDays',
        1,
      ),
      refundPolicy: this.requiredText(
        input.refundPolicy,
        'refundPolicy',
        2000,
      ),
      purchaseNotice: this.requiredText(
        input.purchaseNotice,
        'purchaseNotice',
        2000,
      ),
      status,
      modelIds: this.modelIds(input.modelIds),
    };
  }

  private planData(
    plan: NormalizedPlan,
  ): Prisma.PlanUncheckedCreateInput {
    const { modelIds: _modelIds, ...data } = plan;
    return data;
  }

  private async assertModelsExist(
    transaction: Prisma.TransactionClient,
    modelIds: string[],
  ): Promise<void> {
    const count = await transaction.model.count({
      where: { id: { in: modelIds } },
    });
    if (count !== modelIds.length) {
      throw new NotFoundException(
        'One or more applicable models were not found',
      );
    }
  }

  private disableProduction(
    transaction: Prisma.TransactionClient,
  ): Promise<Prisma.BatchPayload> {
    return transaction.complianceProfile.updateMany({
      where: {
        profileKey: 'default',
        productionEnabled: true,
      },
      data: { productionEnabled: false },
    });
  }

  private toPublicPlan(plan: {
    id: string;
    name: string;
    description: string;
    priceMinor: number;
    currency: string;
    inputQuota: bigint | null;
    outputQuota: bigint | null;
    unifiedQuota: bigint | null;
    activationMode: PlanActivationMode;
    validityDays: number;
    refundPolicy: string;
    purchaseNotice: string;
    status: PlanStatus;
    models: Array<{
      id: string;
      name: string;
      displayName: string;
    }>;
  }) {
    return {
      ...plan,
      inputQuota:
        plan.inputQuota === null ? null : Number(plan.inputQuota),
      outputQuota:
        plan.outputQuota === null ? null : Number(plan.outputQuota),
      unifiedQuota:
        plan.unifiedQuota === null ? null : Number(plan.unifiedQuota),
      applicableModelIds: plan.models.map((model) => model.id),
    };
  }

  private optionalQuota(value: unknown, field: string): bigint | null {
    if (value === undefined || value === null) {
      return null;
    }
    if (
      (typeof value !== 'number' && typeof value !== 'bigint') ||
      (typeof value === 'number' &&
        (!Number.isSafeInteger(value) || value <= 0)) ||
      (typeof value === 'bigint' && value <= 0n)
    ) {
      throw new BadRequestException(`Invalid ${field}`);
    }
    const result = BigInt(value);
    if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new BadRequestException(`Invalid ${field}`);
    }
    return result;
  }

  private modelIds(value: unknown): string[] {
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      value.length > 100 ||
      value.some(
        (id) =>
          typeof id !== 'string' ||
          id.trim().length === 0 ||
          id.trim().length > 100,
      )
    ) {
      throw new BadRequestException('Invalid modelIds');
    }
    const normalized = [...new Set(value.map((id) => id.trim()))];
    if (normalized.length !== value.length) {
      throw new BadRequestException('Duplicate modelIds');
    }
    return normalized;
  }

  private requiredText(
    value: unknown,
    field: string,
    maxLength: number,
  ): string {
    if (
      typeof value !== 'string' ||
      value.trim().length === 0 ||
      value.trim().length > maxLength
    ) {
      throw new BadRequestException(`Invalid ${field}`);
    }
    return value.trim();
  }

  private requiredInteger(
    value: unknown,
    field: string,
    minimum: number,
  ): number {
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < minimum
    ) {
      throw new BadRequestException(`Invalid ${field}`);
    }
    return value;
  }
}
