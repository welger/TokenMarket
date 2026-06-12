import { ConflictException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { ComplianceService } from './compliance.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';

const completeProfile = {
  id: 'compliance_1',
  profileKey: 'default',
  operatorName: '测试经营主体',
  customerServiceContact: '在线客服',
  complaintChannel: '投诉表单',
  serverRegion: '中国大陆',
  logRetentionDays: 30,
  businessDataRetentionDays: 7,
  dataExportMethod: '用户中心申请导出',
  dataDeletionMethod: '用户中心申请删除',
  accountCancellationMethod: '用户中心申请注销',
  privacyPolicyUrl: 'https://example.test/privacy',
  termsOfServiceUrl: 'https://example.test/terms',
  contentSafetyRulesUrl: 'https://example.test/safety',
  productionEnabled: false,
  updatedByAdminId: 'admin_1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createHarness(profile: typeof completeProfile | null) {
  const findUnique = jest.fn().mockResolvedValue(profile);
  const providerCount = jest.fn().mockResolvedValue(1);
  const modelCount = jest.fn().mockResolvedValue(1);
  const ruleCount = jest.fn().mockResolvedValue(1);
  const update = jest.fn().mockResolvedValue({
    ...completeProfile,
    productionEnabled: true,
  });
  const transaction = {
    complianceProfile: { findUnique, update },
    provider: { count: providerCount },
    model: { count: modelCount },
    contentPolicyRule: { count: ruleCount },
  };
  const audit = {
    runInAuditedTransaction: jest.fn(
      async (
        _input: unknown,
        operation: (context: {
          transaction: typeof transaction;
          setBeforeSummary(value: unknown): void;
          setAfterSummary(value: unknown): void;
        }) => Promise<unknown>,
      ) =>
        operation({
          transaction,
          setBeforeSummary: () => undefined,
          setAfterSummary: () => undefined,
        }),
    ),
  } as unknown as AuditService;
  const prisma = {
    complianceProfile: { findUnique },
  } as unknown as PrismaService;
  const service = new ComplianceService(prisma, audit);

  return {
    service,
    audit,
    providerCount,
    modelCount,
    ruleCount,
    update,
  };
}

describe('ComplianceService', () => {
  it('rejects an empty profile update', () => {
    const harness = createHarness(completeProfile);

    expect(() =>
      harness.service.updateProfile('admin_1', {}),
    ).toThrow('At least one compliance field is required');
  });

  it.each([
    ['missing profile', null],
    ['missing operator', { ...completeProfile, operatorName: null }],
    [
      'invalid retention',
      { ...completeProfile, logRetentionDays: -1 },
    ],
  ])('rejects production mode for %s', async (_label, profile) => {
    const harness = createHarness(profile as typeof completeProfile | null);

    await expect(
      harness.service.enableProduction('admin_1'),
    ).rejects.toMatchObject({
      code: 'COMPLIANCE_PROFILE_INCOMPLETE',
    });
  });

  it('requires at least one active disclosed provider and available model', async () => {
    const harness = createHarness(completeProfile);
    harness.providerCount.mockResolvedValue(0);

    await expect(
      harness.service.enableProduction('admin_1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires at least one enabled content safety rule', async () => {
    const harness = createHarness(completeProfile);
    harness.ruleCount.mockResolvedValue(0);

    await expect(
      harness.service.enableProduction('admin_1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('enables production through an audited transaction', async () => {
    const harness = createHarness(completeProfile);

    await expect(
      harness.service.enableProduction('admin_1'),
    ).resolves.toMatchObject({ productionEnabled: true });
    expect(harness.audit.runInAuditedTransaction).toHaveBeenCalled();
    expect(harness.update).toHaveBeenCalledWith({
      where: { id: completeProfile.id },
      data: {
        productionEnabled: true,
        updatedByAdminId: 'admin_1',
      },
    });
  });
});
