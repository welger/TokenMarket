import type { ConfigService } from '@nestjs/config';
import { jest } from '@jest/globals';

import {
  ProductionReadinessService,
  type ProductionReadinessCheck,
} from './production-readiness.service.js';
import type { EnvironmentVariables } from '../common/config/env.schema.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import { ModelStatus, ProviderStatus } from '../generated/prisma/client.js';

const completeProfile = {
  operatorName: '测试经营主体',
  customerServiceContact: '在线客服',
  complaintChannel: '投诉表单',
  serverRegion: '中国大陆',
  logRetentionDays: 30,
  businessDataRetentionDays: 365,
  dataExportMethod: '用户中心申请导出',
  dataDeletionMethod: '用户中心申请删除',
  accountCancellationMethod: '用户中心申请注销',
  privacyPolicyUrl: 'https://example.test/privacy',
  termsOfServiceUrl: 'https://example.test/terms',
  contentSafetyRulesUrl: 'https://example.test/safety',
};

const baseEnv: Pick<
  EnvironmentVariables,
  | 'NODE_ENV'
  | 'PAYMENT_DRIVER'
  | 'WECHAT_APP_ID'
  | 'WECHAT_APP_SECRET'
  | 'WECHAT_PAY_MCH_ID'
  | 'WECHAT_PAY_SERIAL_NO'
  | 'WECHAT_PAY_PRIVATE_KEY_PATH'
  | 'WECHAT_PAY_API_V3_KEY'
  | 'WECHAT_PAY_NOTIFY_URL'
  | 'WECHAT_TEST_LOGIN_ENABLED'
  | 'TRUST_PROXY_CIDRS'
> = {
  NODE_ENV: 'production',
  PAYMENT_DRIVER: 'wechat',
  WECHAT_APP_ID: 'configured',
  WECHAT_APP_SECRET: 'configured',
  WECHAT_PAY_MCH_ID: 'configured',
  WECHAT_PAY_SERIAL_NO: 'configured',
  WECHAT_PAY_PRIVATE_KEY_PATH: 'configured',
  WECHAT_PAY_API_V3_KEY: 'configured',
  WECHAT_PAY_NOTIFY_URL: 'https://api.example.test/payments/wechat/notify',
  WECHAT_TEST_LOGIN_ENABLED: false,
  TRUST_PROXY_CIDRS: ['10.0.0.0/8'],
};

function createHarness({
  profile = completeProfile,
  providerCount = 1,
  modelCount = 1,
  ruleCount = 1,
  env = {},
}: {
  profile?: typeof completeProfile | null;
  providerCount?: number;
  modelCount?: number;
  ruleCount?: number;
  env?: Partial<typeof baseEnv>;
} = {}) {
  const values = { ...baseEnv, ...env };
  const prisma = {
    complianceProfile: {
      findUnique: jest.fn().mockResolvedValue(profile),
    },
    provider: {
      count: jest.fn().mockResolvedValue(providerCount),
    },
    model: {
      count: jest.fn().mockResolvedValue(modelCount),
    },
    contentPolicyRule: {
      count: jest.fn().mockResolvedValue(ruleCount),
    },
  } as unknown as PrismaService;
  const config = {
    get: jest.fn((key: keyof typeof values) => values[key]),
  } as unknown as ConfigService<EnvironmentVariables, true>;

  return {
    service: new ProductionReadinessService(prisma, config),
    prisma,
  };
}

function findCheck(
  checks: ProductionReadinessCheck[],
  id: string,
): ProductionReadinessCheck {
  const check = checks.find((item) => item.id === id);
  if (!check) {
    throw new Error(`Missing check ${id}`);
  }
  return check;
}

describe('ProductionReadinessService', () => {
  it('passes when compliance, model, policy, and production env checks are complete', async () => {
    const { service } = createHarness();

    const result = await service.getReadiness();

    expect(result.status).toBe('PASS');
    expect(result.summary).toEqual({ pass: result.checks.length, warn: 0, fail: 0 });
    expect(result.checks.every((check) => check.status === 'PASS')).toBe(true);
  });

  it('fails missing compliance fields without returning secret values', async () => {
    const { service } = createHarness({
      profile: {
        ...completeProfile,
        operatorName: '',
        privacyPolicyUrl: '',
      },
    });

    const result = await service.getReadiness();

    expect(result.status).toBe('FAIL');
    expect(findCheck(result.checks, 'compliance.operator').status).toBe('FAIL');
    expect(findCheck(result.checks, 'compliance.privacyPolicyUrl').status).toBe('FAIL');
    expect(JSON.stringify(result)).not.toContain('configured');
  });

  it('fails when providers, models, or content safety rules are missing', async () => {
    const { service } = createHarness({
      providerCount: 0,
      modelCount: 0,
      ruleCount: 0,
    });

    const result = await service.getReadiness();

    expect(result.status).toBe('FAIL');
    expect(findCheck(result.checks, 'catalog.providerDisclosures').status).toBe('FAIL');
    expect(findCheck(result.checks, 'catalog.availableModels').status).toBe('FAIL');
    expect(findCheck(result.checks, 'safety.contentRules').status).toBe('FAIL');
  });

  it('fails unsafe production environment settings and warns on missing trusted proxies', async () => {
    const { service } = createHarness({
      env: {
        PAYMENT_DRIVER: 'test',
        WECHAT_TEST_LOGIN_ENABLED: true,
        WECHAT_APP_ID: undefined,
        WECHAT_APP_SECRET: undefined,
        TRUST_PROXY_CIDRS: [],
      },
    });

    const result = await service.getReadiness();

    expect(result.status).toBe('FAIL');
    expect(findCheck(result.checks, 'runtime.paymentDriver').status).toBe('FAIL');
    expect(findCheck(result.checks, 'runtime.wechatTestLogin').status).toBe('FAIL');
    expect(findCheck(result.checks, 'wechat.credentials').status).toBe('FAIL');
    expect(findCheck(result.checks, 'runtime.trustedProxy').status).toBe('WARN');
  });

  it('fails when WeChat Pay production configuration is incomplete', async () => {
    const { service } = createHarness({
      env: {
        WECHAT_PAY_MCH_ID: undefined,
        WECHAT_PAY_SERIAL_NO: '',
        WECHAT_PAY_PRIVATE_KEY_PATH: undefined,
        WECHAT_PAY_API_V3_KEY: undefined,
        WECHAT_PAY_NOTIFY_URL: '',
      },
    });

    const result = await service.getReadiness();

    expect(result.status).toBe('FAIL');
    expect(findCheck(result.checks, 'wechatPay.merchant').status).toBe('FAIL');
    expect(findCheck(result.checks, 'wechatPay.certificate').status).toBe('FAIL');
    expect(findCheck(result.checks, 'wechatPay.notifyUrl').status).toBe('FAIL');
    expect(JSON.stringify(result)).not.toContain('WECHAT_PAY_API_V3_KEY');
  });

  it('queries only active disclosed providers and available models', async () => {
    const { service, prisma } = createHarness();

    await service.getReadiness();

    expect(prisma.provider.count).toHaveBeenCalledWith({
      where: {
        status: ProviderStatus.ACTIVE,
        disclosurePurpose: { not: '' },
        region: { not: '' },
      },
    });
    expect(prisma.model.count).toHaveBeenCalledWith({
      where: {
        status: ModelStatus.AVAILABLE,
        provider: { status: ProviderStatus.ACTIVE },
      },
    });
  });
});
