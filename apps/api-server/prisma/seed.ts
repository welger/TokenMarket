import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { PrismaPg } from '@prisma/adapter-pg';
import { argon2id, hash } from 'argon2';

import {
  AdminRole,
  AdminUserStatus,
  ContentPolicyAction,
  ContentPolicyMatchType,
  FulfillmentType,
  ModelStatus,
  PlanActivationMode,
  PlanStatus,
  PrismaClient,
  ProviderStatus,
  UsageLedgerType,
  UserPlanStatus,
  UserStatus,
} from '../src/generated/prisma/client.js';

export const PHASE_ONE_SEED = {
  admin: {
    id: 'seed_phase_one_admin',
    username: 'phase-one-owner',
    password: 'Local-only-phase-one-owner',
  },
  user: {
    id: 'seed_phase_one_user',
  },
  provider: {
    id: 'seed_phase_one_provider',
    name: 'phase-one-test-provider',
  },
  model: {
    id: 'seed_phase_one_model',
    name: 'phase-one-seed-model',
  },
  plan: {
    id: 'seed_phase_one_plan',
  },
  compliance: {
    id: 'seed_phase_one_compliance',
  },
  contentRule: {
    id: 'seed_phase_one_content_rule',
  },
} as const;

export async function seedPhaseOne(prisma: PrismaClient): Promise<void> {
  const passwordHash = await hash(PHASE_ONE_SEED.admin.password, {
    type: argon2id,
  });

  await prisma.adminUser.upsert({
    where: { id: PHASE_ONE_SEED.admin.id },
    create: {
      id: PHASE_ONE_SEED.admin.id,
      username: PHASE_ONE_SEED.admin.username,
      displayName: '阶段一测试所有者',
      passwordHash,
      role: AdminRole.OWNER,
      status: AdminUserStatus.ACTIVE,
    },
    update: {
      username: PHASE_ONE_SEED.admin.username,
      displayName: '阶段一测试所有者',
      passwordHash,
      role: AdminRole.OWNER,
      status: AdminUserStatus.ACTIVE,
    },
  });

  await prisma.user.upsert({
    where: { id: PHASE_ONE_SEED.user.id },
    create: {
      id: PHASE_ONE_SEED.user.id,
      status: UserStatus.ACTIVE,
      termsAcceptedAt: new Date('2026-01-01T00:00:00.000Z'),
      privacyAcceptedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    update: {
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
  });

  await prisma.provider.upsert({
    where: { id: PHASE_ONE_SEED.provider.id },
    create: {
      id: PHASE_ONE_SEED.provider.id,
      name: PHASE_ONE_SEED.provider.name,
      displayName: '阶段一测试供应商',
      configRef: 'env:TEST_PROVIDER',
      disclosurePurpose: '仅用于本地模型推理测试',
      region: '本地测试环境',
      status: ProviderStatus.ACTIVE,
      routingPriority: 10,
    },
    update: {
      displayName: '阶段一测试供应商',
      configRef: 'env:TEST_PROVIDER',
      disclosurePurpose: '仅用于本地模型推理测试',
      region: '本地测试环境',
      status: ProviderStatus.ACTIVE,
      routingPriority: 10,
    },
  });

  await prisma.model.upsert({
    where: { id: PHASE_ONE_SEED.model.id },
    create: {
      id: PHASE_ONE_SEED.model.id,
      providerId: PHASE_ONE_SEED.provider.id,
      name: PHASE_ONE_SEED.model.name,
      upstreamModel: 'phase-one-seed-upstream',
      displayName: '阶段一固定测试模型',
      description: '仅用于本地开发与验收',
      capabilities: ['chat'],
      contextWindow: 8192,
      inputMultiplier: 1,
      outputMultiplier: 1,
      status: ModelStatus.AVAILABLE,
      routingPriority: 10,
    },
    update: {
      providerId: PHASE_ONE_SEED.provider.id,
      upstreamModel: 'phase-one-seed-upstream',
      displayName: '阶段一固定测试模型',
      description: '仅用于本地开发与验收',
      capabilities: ['chat'],
      contextWindow: 8192,
      inputMultiplier: 1,
      outputMultiplier: 1,
      status: ModelStatus.AVAILABLE,
      routingPriority: 10,
    },
  });

  await prisma.plan.upsert({
    where: { id: PHASE_ONE_SEED.plan.id },
    create: {
      id: PHASE_ONE_SEED.plan.id,
      name: '阶段一固定测试套餐',
      description: '仅用于本地开发测试',
      priceMinor: 100,
      currency: 'CNY',
      unifiedQuota: 1_000_000,
      activationMode: PlanActivationMode.IMMEDIATE,
      validityDays: 30,
      refundPolicy: '本地测试套餐不涉及真实退款',
      purchaseNotice: '本地测试支付不产生真实扣款',
      status: PlanStatus.ACTIVE,
      models: {
        connect: { id: PHASE_ONE_SEED.model.id },
      },
    },
    update: {
      name: '阶段一固定测试套餐',
      description: '仅用于本地开发测试',
      priceMinor: 100,
      currency: 'CNY',
      inputQuota: null,
      outputQuota: null,
      unifiedQuota: 1_000_000,
      activationMode: PlanActivationMode.IMMEDIATE,
      validityDays: 30,
      refundPolicy: '本地测试套餐不涉及真实退款',
      purchaseNotice: '本地测试支付不产生真实扣款',
      status: PlanStatus.ACTIVE,
      models: {
        set: [{ id: PHASE_ONE_SEED.model.id }],
      },
    },
  });

  await prisma.complianceProfile.upsert({
    where: { profileKey: 'default' },
    create: {
      id: PHASE_ONE_SEED.compliance.id,
      profileKey: 'default',
      operatorName: '示例经营主体（仅本地测试）',
      customerServiceContact: '本地测试在线客服',
      complaintChannel: '本地测试投诉入口',
      serverRegion: '本地测试环境',
      logRetentionDays: 30,
      businessDataRetentionDays: 365,
      dataExportMethod: '在本地测试控制台提交导出申请',
      dataDeletionMethod: '在本地测试控制台提交删除申请',
      accountCancellationMethod: '通过本地测试客服申请注销',
      privacyPolicyUrl: 'https://example.invalid/privacy',
      termsOfServiceUrl: 'https://example.invalid/terms',
      contentSafetyRulesUrl: 'https://example.invalid/safety',
      productionEnabled: false,
      updatedByAdminId: PHASE_ONE_SEED.admin.id,
    },
    update: {
      operatorName: '示例经营主体（仅本地测试）',
      customerServiceContact: '本地测试在线客服',
      complaintChannel: '本地测试投诉入口',
      serverRegion: '本地测试环境',
      logRetentionDays: 30,
      businessDataRetentionDays: 365,
      dataExportMethod: '在本地测试控制台提交导出申请',
      dataDeletionMethod: '在本地测试控制台提交删除申请',
      accountCancellationMethod: '通过本地测试客服申请注销',
      privacyPolicyUrl: 'https://example.invalid/privacy',
      termsOfServiceUrl: 'https://example.invalid/terms',
      contentSafetyRulesUrl: 'https://example.invalid/safety',
      productionEnabled: false,
      updatedByAdminId: PHASE_ONE_SEED.admin.id,
    },
  });

  await prisma.contentPolicyRule.upsert({
    where: { id: PHASE_ONE_SEED.contentRule.id },
    create: {
      id: PHASE_ONE_SEED.contentRule.id,
      name: '阶段一本地违法内容拦截规则',
      enabled: true,
      category: 'ILLEGAL_CONTENT',
      matchType: ContentPolicyMatchType.KEYWORD,
      pattern: '阶段一测试禁词',
      action: ContentPolicyAction.BLOCK,
    },
    update: {
      name: '阶段一本地违法内容拦截规则',
      enabled: true,
      category: 'ILLEGAL_CONTENT',
      matchType: ContentPolicyMatchType.KEYWORD,
      pattern: '阶段一测试禁词',
      action: ContentPolicyAction.BLOCK,
    },
  });
}

export async function grantPhaseOneTestPlan(
  prisma: PrismaClient,
  input: {
    userId: string;
    planId: string;
    quota: number;
  },
) {
  if (!Number.isSafeInteger(input.quota) || input.quota <= 0) {
    throw new Error('Phase one test quota must be a positive integer');
  }

  return prisma.$transaction(async (transaction) => {
    const userPlan = await transaction.userPlan.create({
      data: {
        id: `phase_one_grant_${randomUUID()}`,
        userId: input.userId,
        planId: input.planId,
        fulfillmentType: FulfillmentType.ADMIN_GRANT,
        status: UserPlanStatus.ACTIVE,
        initialUnifiedQuota: input.quota,
        remainingUnifiedQuota: input.quota,
        activatedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    await transaction.usageLedger.create({
      data: {
        userId: input.userId,
        userPlanId: userPlan.id,
        type: UsageLedgerType.GRANT,
        chargedUnits: input.quota,
        remainingUnified: input.quota,
        description: '阶段一端到端测试套餐发放',
      },
    });
    return userPlan;
  });
}

export async function removePhaseOneSeed(
  prisma: PrismaClient,
): Promise<void> {
  await prisma.contentPolicyEvent.deleteMany({
    where: { ruleId: PHASE_ONE_SEED.contentRule.id },
  });
  await prisma.contentPolicyRule.deleteMany({
    where: { id: PHASE_ONE_SEED.contentRule.id },
  });
  await prisma.invoiceOrder.deleteMany({
    where: { userId: PHASE_ONE_SEED.user.id },
  });
  await prisma.invoice.deleteMany({
    where: { userId: PHASE_ONE_SEED.user.id },
  });
  await prisma.refund.deleteMany({
    where: { userId: PHASE_ONE_SEED.user.id },
  });
  await prisma.usageLedger.deleteMany({
    where: { userId: PHASE_ONE_SEED.user.id },
  });
  await prisma.apiCall.deleteMany({
    where: { userId: PHASE_ONE_SEED.user.id },
  });
  await prisma.apiKey.deleteMany({
    where: { userId: PHASE_ONE_SEED.user.id },
  });
  await prisma.userPlan.deleteMany({
    where: { userId: PHASE_ONE_SEED.user.id },
  });
  await prisma.order.deleteMany({
    where: { userId: PHASE_ONE_SEED.user.id },
  });
  await prisma.auditLog.deleteMany({
    where: { adminUserId: PHASE_ONE_SEED.admin.id },
  });
  await prisma.complianceProfile.deleteMany({
    where: {
      OR: [
        { id: PHASE_ONE_SEED.compliance.id },
        { updatedByAdminId: PHASE_ONE_SEED.admin.id },
      ],
    },
  });
  await prisma.plan.updateMany({
    where: { id: PHASE_ONE_SEED.plan.id },
    data: { status: PlanStatus.INACTIVE },
  });
  const seededPlan = await prisma.plan.findUnique({
    where: { id: PHASE_ONE_SEED.plan.id },
  });
  if (seededPlan) {
    await prisma.plan.update({
      where: { id: seededPlan.id },
      data: { models: { set: [] } },
    });
  }
  await prisma.plan.deleteMany({
    where: { id: PHASE_ONE_SEED.plan.id },
  });
  await prisma.model.deleteMany({
    where: { id: PHASE_ONE_SEED.model.id },
  });
  await prisma.provider.deleteMany({
    where: { id: PHASE_ONE_SEED.provider.id },
  });
  await prisma.user.deleteMany({
    where: { id: PHASE_ONE_SEED.user.id },
  });
  await prisma.adminUser.deleteMany({
    where: { id: PHASE_ONE_SEED.admin.id },
  });
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run the phase one seed');
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  try {
    await seedPhaseOne(prisma);
    console.log('Phase one local test data is ready.');
  } finally {
    await prisma.$disconnect();
  }
}

const entrypoint = process.argv[1];
if (
  entrypoint &&
  import.meta.url === pathToFileURL(entrypoint).href
) {
  void main();
}
