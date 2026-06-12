import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import {
  ModelStatus,
  ProviderStatus,
  type ComplianceProfile,
  type Prisma,
} from '../generated/prisma/client.js';

export interface ComplianceProfileWriteInput {
  operatorName?: unknown;
  customerServiceContact?: unknown;
  complaintChannel?: unknown;
  serverRegion?: unknown;
  logRetentionDays?: unknown;
  businessDataRetentionDays?: unknown;
  dataExportMethod?: unknown;
  dataDeletionMethod?: unknown;
  accountCancellationMethod?: unknown;
  privacyPolicyUrl?: unknown;
  termsOfServiceUrl?: unknown;
  contentSafetyRulesUrl?: unknown;
  productionEnabled?: unknown;
}

export class ComplianceProfileIncompleteException extends ConflictException {
  readonly code = 'COMPLIANCE_PROFILE_INCOMPLETE';

  constructor() {
    super({
      code: 'COMPLIANCE_PROFILE_INCOMPLETE',
      message: '生产环境合规资料不完整',
    });
  }
}

@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  getAdminProfile(): Promise<ComplianceProfile | null> {
    return this.prisma.complianceProfile.findUnique({
      where: { profileKey: 'default' },
    });
  }

  updateProfile(
    adminUserId: string,
    input: ComplianceProfileWriteInput,
  ): Promise<ComplianceProfile> {
    if (input.productionEnabled !== undefined) {
      throw new ConflictException(
        'Use the production enable endpoint after disclosures are complete',
      );
    }
    const changes = this.parseProfileInput(input);
    if (Object.keys(changes).length === 0) {
      throw new BadRequestException(
        'At least one compliance field is required',
      );
    }

    return this.auditService.runInAuditedTransaction(
      {
        adminUserId,
        action: 'COMPLIANCE_PROFILE_UPDATED',
        resourceType: 'compliance_profile',
      },
      async ({
        transaction,
        setBeforeSummary,
        setAfterSummary,
      }) => {
        const current = await transaction.complianceProfile.findUnique({
          where: { profileKey: 'default' },
        });
        const merged = {
          ...(current ?? {}),
          ...changes,
          updatedByAdminId: adminUserId,
        } as ComplianceProfile;
        const productionEnabled =
          current?.productionEnabled === true && this.isComplete(merged);
        const data: Prisma.ComplianceProfileUncheckedUpdateInput = {
          ...changes,
          productionEnabled,
          updatedByAdminId: adminUserId,
        };

        const updated = current
          ? await transaction.complianceProfile.update({
              where: { id: current.id },
              data,
            })
          : await transaction.complianceProfile.create({
              data: {
                ...(data as Prisma.ComplianceProfileUncheckedCreateInput),
                profileKey: 'default',
              },
            });
        setBeforeSummary(
          current
            ? {
                productionEnabled: current.productionEnabled,
                updatedAt: current.updatedAt,
              }
            : undefined,
        );
        setAfterSummary({
          id: updated.id,
          productionEnabled: updated.productionEnabled,
        });
        return updated;
      },
    );
  }

  async getPublicProfile(): Promise<Record<string, unknown> | null> {
    const profile = await this.prisma.complianceProfile.findUnique({
      where: { profileKey: 'default' },
    });
    if (!profile) {
      return null;
    }

    const providers = await this.prisma.provider.findMany({
      where: { status: ProviderStatus.ACTIVE },
      select: {
        displayName: true,
        disclosurePurpose: true,
        region: true,
      },
      orderBy: [
        { routingPriority: 'asc' },
        { displayName: 'asc' },
      ],
    });

    return {
      operatorName: profile.operatorName,
      customerServiceContact: profile.customerServiceContact,
      complaintChannel: profile.complaintChannel,
      serverRegion: profile.serverRegion,
      providers: providers.map((provider) => ({
        name: provider.displayName,
        purpose: provider.disclosurePurpose,
        region: provider.region,
      })),
      logRetentionDays: profile.logRetentionDays,
      businessDataRetentionDays: profile.businessDataRetentionDays,
      dataExportMethod: profile.dataExportMethod,
      dataDeletionMethod: profile.dataDeletionMethod,
      accountCancellationMethod: profile.accountCancellationMethod,
      privacyPolicyUrl: profile.privacyPolicyUrl,
      termsOfServiceUrl: profile.termsOfServiceUrl,
      contentSafetyRulesUrl: profile.contentSafetyRulesUrl,
      productionEnabled: profile.productionEnabled,
      updatedAt: profile.updatedAt,
    };
  }

  enableProduction(adminUserId: string): Promise<ComplianceProfile> {
    return this.auditService.runInAuditedTransaction(
      {
        adminUserId,
        action: 'PRODUCTION_MODE_ENABLED',
        resourceType: 'compliance_profile',
      },
      async ({ transaction, setBeforeSummary, setAfterSummary }) => {
        const profile = await transaction.complianceProfile.findUnique({
          where: { profileKey: 'default' },
        });
        if (!this.isComplete(profile)) {
          throw new ComplianceProfileIncompleteException();
        }

        const [providerCount, modelCount, ruleCount] = await Promise.all([
          transaction.provider.count({
            where: {
              status: ProviderStatus.ACTIVE,
              disclosurePurpose: { not: '' },
              region: { not: '' },
            },
          }),
          transaction.model.count({
            where: {
              status: ModelStatus.AVAILABLE,
              provider: { status: ProviderStatus.ACTIVE },
            },
          }),
          transaction.contentPolicyRule.count({
            where: { enabled: true },
          }),
        ]);
        if (
          providerCount === 0 ||
          modelCount === 0 ||
          ruleCount === 0
        ) {
          throw new ComplianceProfileIncompleteException();
        }

        setBeforeSummary({ productionEnabled: profile.productionEnabled });
        const updated = await transaction.complianceProfile.update({
          where: { id: profile.id },
          data: {
            productionEnabled: true,
            updatedByAdminId: adminUserId,
          },
        });
        setAfterSummary({ productionEnabled: true });
        return updated;
      },
    );
  }

  private isComplete(
    profile: ComplianceProfile | null,
  ): profile is ComplianceProfile {
    if (!profile) {
      return false;
    }

    const requiredText = [
      profile.operatorName,
      profile.customerServiceContact,
      profile.complaintChannel,
      profile.serverRegion,
      profile.dataExportMethod,
      profile.dataDeletionMethod,
      profile.accountCancellationMethod,
    ];

    return (
      requiredText.every(
        (value) => typeof value === 'string' && value.trim().length > 0,
      ) &&
      Number.isInteger(profile.logRetentionDays) &&
      profile.logRetentionDays !== null &&
      profile.logRetentionDays >= 0 &&
      Number.isInteger(profile.businessDataRetentionDays) &&
      profile.businessDataRetentionDays !== null &&
      profile.businessDataRetentionDays >= 0 &&
      typeof profile.privacyPolicyUrl === 'string' &&
      this.isHttpUrl(profile.privacyPolicyUrl) &&
      typeof profile.termsOfServiceUrl === 'string' &&
      this.isHttpUrl(profile.termsOfServiceUrl) &&
      typeof profile.contentSafetyRulesUrl === 'string' &&
      this.isHttpUrl(profile.contentSafetyRulesUrl)
    );
  }

  private parseProfileInput(
    input: ComplianceProfileWriteInput,
  ): Prisma.ComplianceProfileUncheckedUpdateInput {
    const data: Prisma.ComplianceProfileUncheckedUpdateInput = {};
    for (const key of [
      'operatorName',
      'customerServiceContact',
      'complaintChannel',
      'serverRegion',
      'dataExportMethod',
      'dataDeletionMethod',
      'accountCancellationMethod',
    ] as const) {
      const value = input[key];
      if (value === undefined) {
        continue;
      }
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new ConflictException(`Invalid ${key}`);
      }
      data[key] = value.trim();
    }

    for (const key of [
      'privacyPolicyUrl',
      'termsOfServiceUrl',
      'contentSafetyRulesUrl',
    ] as const) {
      const value = input[key];
      if (value === undefined) {
        continue;
      }
      if (typeof value !== 'string' || !this.isHttpUrl(value)) {
        throw new ConflictException(`Invalid ${key}`);
      }
      data[key] = value.trim();
    }

    for (const key of [
      'logRetentionDays',
      'businessDataRetentionDays',
    ] as const) {
      const value = input[key];
      if (value === undefined) {
        continue;
      }
      if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < 0
      ) {
        throw new ConflictException(`Invalid ${key}`);
      }
      data[key] = value;
    }
    return data;
  }

  private isHttpUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }
}
