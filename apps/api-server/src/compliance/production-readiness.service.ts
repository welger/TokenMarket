import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../common/config/env.schema.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { ModelStatus, ProviderStatus } from '../generated/prisma/client.js';

export type ProductionReadinessStatus = 'PASS' | 'WARN' | 'FAIL';

export interface ProductionReadinessCheck {
  id: string;
  label: string;
  status: ProductionReadinessStatus;
  message: string;
}

export interface ProductionReadinessResult {
  status: ProductionReadinessStatus;
  generatedAt: string;
  summary: Record<Lowercase<ProductionReadinessStatus>, number>;
  checks: ProductionReadinessCheck[];
}

@Injectable()
export class ProductionReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async getReadiness(): Promise<ProductionReadinessResult> {
    const [profile, providerCount, modelCount, ruleCount] =
      await Promise.all([
        this.prisma.complianceProfile.findUnique({
          where: { profileKey: 'default' },
        }),
        this.prisma.provider.count({
          where: {
            status: ProviderStatus.ACTIVE,
            disclosurePurpose: { not: '' },
            region: { not: '' },
          },
        }),
        this.prisma.model.count({
          where: {
            status: ModelStatus.AVAILABLE,
            provider: { status: ProviderStatus.ACTIVE },
          },
        }),
        this.prisma.contentPolicyRule.count({
          where: { enabled: true },
        }),
      ]);

    const checks: ProductionReadinessCheck[] = [
      this.textCheck(
        'compliance.operator',
        '经营主体',
        profile?.operatorName,
        '已填写经营主体',
        '请填写真实经营主体',
      ),
      this.textCheck(
        'compliance.customerService',
        '客服入口',
        profile?.customerServiceContact,
        '已填写客服入口',
        '请填写真实客服电话或在线客服入口',
      ),
      this.textCheck(
        'compliance.complaintChannel',
        '投诉渠道',
        profile?.complaintChannel,
        '已填写投诉渠道',
        '请填写投诉电话、邮箱或在线投诉入口',
      ),
      this.textCheck(
        'compliance.serverRegion',
        '服务器地区',
        profile?.serverRegion,
        '已填写服务器地区',
        '请说明服务器所在地区',
      ),
      this.numberCheck(
        'compliance.logRetentionDays',
        '调用日志保存期',
        profile?.logRetentionDays,
        '已填写调用日志保存期',
        '请填写调用日志保存天数',
      ),
      this.numberCheck(
        'compliance.businessDataRetentionDays',
        '业务数据保存期',
        profile?.businessDataRetentionDays,
        '已填写业务数据保存期',
        '请填写业务数据保存天数',
      ),
      this.textCheck(
        'compliance.dataExportMethod',
        '数据导出方式',
        profile?.dataExportMethod,
        '已填写数据导出方式',
        '请说明用户如何导出数据',
      ),
      this.textCheck(
        'compliance.dataDeletionMethod',
        '数据删除方式',
        profile?.dataDeletionMethod,
        '已填写数据删除方式',
        '请说明用户如何删除数据',
      ),
      this.textCheck(
        'compliance.accountCancellationMethod',
        '账户注销方式',
        profile?.accountCancellationMethod,
        '已填写账户注销方式',
        '请说明用户如何注销账户',
      ),
      this.urlCheck(
        'compliance.privacyPolicyUrl',
        '隐私政策 URL',
        profile?.privacyPolicyUrl,
      ),
      this.urlCheck(
        'compliance.termsOfServiceUrl',
        '用户协议 URL',
        profile?.termsOfServiceUrl,
      ),
      this.urlCheck(
        'compliance.contentSafetyRulesUrl',
        '内容安全规则 URL',
        profile?.contentSafetyRulesUrl,
      ),
      this.countCheck(
        'catalog.providerDisclosures',
        '供应商披露',
        providerCount,
        '至少一个启用供应商已填写用途和地区',
        '请配置至少一个启用供应商，并填写用途和地区',
      ),
      this.countCheck(
        'catalog.availableModels',
        '可用模型',
        modelCount,
        '至少一个模型可用',
        '请配置至少一个绑定启用供应商的可用模型',
      ),
      this.countCheck(
        'safety.contentRules',
        '内容安全规则',
        ruleCount,
        '至少一条内容安全规则已启用',
        '请启用违法、诈骗、攻击、侵权和滥用限制规则',
      ),
      ...this.runtimeChecks(),
    ];

    const summary = checks.reduce(
      (current, check) => ({
        ...current,
        [check.status.toLowerCase()]:
          current[check.status.toLowerCase() as keyof typeof current] + 1,
      }),
      { pass: 0, warn: 0, fail: 0 },
    );

    return {
      status: this.overallStatus(summary),
      generatedAt: new Date().toISOString(),
      summary,
      checks,
    };
  }

  private runtimeChecks(): ProductionReadinessCheck[] {
    const nodeEnv = this.config.get('NODE_ENV', { infer: true });
    const paymentDriver = this.config.get('PAYMENT_DRIVER', {
      infer: true,
    });
    const wechatTestLogin = this.config.get(
      'WECHAT_TEST_LOGIN_ENABLED',
      { infer: true },
    );
    const wechatAppId = this.config.get('WECHAT_APP_ID', {
      infer: true,
    });
    const wechatAppSecret = this.config.get('WECHAT_APP_SECRET', {
      infer: true,
    });
    const wechatPayMchId = this.config.get('WECHAT_PAY_MCH_ID', {
      infer: true,
    });
    const wechatPaySerialNo = this.config.get('WECHAT_PAY_SERIAL_NO', {
      infer: true,
    });
    const wechatPayPrivateKeyPath = this.config.get(
      'WECHAT_PAY_PRIVATE_KEY_PATH',
      { infer: true },
    );
    const wechatPayApiV3Key = this.config.get('WECHAT_PAY_API_V3_KEY', {
      infer: true,
    });
    const wechatPayNotifyUrl = this.config.get('WECHAT_PAY_NOTIFY_URL', {
      infer: true,
    });
    const trustedProxyCidrs =
      this.config.get('TRUST_PROXY_CIDRS', { infer: true }) ?? [];

    return [
      {
        id: 'runtime.nodeEnv',
        label: '生产运行环境',
        status: nodeEnv === 'production' ? 'PASS' : 'WARN',
        message:
          nodeEnv === 'production'
            ? '当前环境为生产模式'
            : '正式发布前需要设置 NODE_ENV=production',
      },
      {
        id: 'runtime.paymentDriver',
        label: '支付驱动',
        status: paymentDriver === 'wechat' ? 'PASS' : 'FAIL',
        message:
          paymentDriver === 'wechat'
            ? '支付驱动已切换为微信支付'
            : '正式发布前必须关闭测试支付驱动',
      },
      {
        id: 'runtime.wechatTestLogin',
        label: '微信测试登录',
        status: wechatTestLogin ? 'FAIL' : 'PASS',
        message: wechatTestLogin
          ? '正式发布前必须关闭微信测试登录'
          : '微信测试登录已关闭',
      },
      {
        id: 'wechat.credentials',
        label: '微信小程序凭据',
        status:
          this.hasText(wechatAppId) && this.hasText(wechatAppSecret)
            ? 'PASS'
            : 'FAIL',
        message:
          this.hasText(wechatAppId) && this.hasText(wechatAppSecret)
            ? '微信 AppID 和 AppSecret 已通过环境变量配置'
            : '请在生产环境变量中配置微信 AppID 和 AppSecret',
      },
      {
        id: 'runtime.trustedProxy',
        label: '可信代理',
        status: trustedProxyCidrs.length > 0 ? 'PASS' : 'WARN',
        message:
          trustedProxyCidrs.length > 0
            ? '已配置可信反向代理来源'
            : '如生产环境位于反向代理后，请配置真实代理 CIDR',
      },
      {
        id: 'wechatPay.merchant',
        label: '微信支付商户号',
        status: this.hasText(wechatPayMchId) ? 'PASS' : 'FAIL',
        message: this.hasText(wechatPayMchId)
          ? '微信支付商户号已配置'
          : '请在生产环境变量中配置微信支付商户号',
      },
      {
        id: 'wechatPay.certificate',
        label: '微信支付证书和密钥',
        status:
          this.hasText(wechatPaySerialNo) &&
          this.hasText(wechatPayPrivateKeyPath) &&
          this.hasText(wechatPayApiV3Key)
            ? 'PASS'
            : 'FAIL',
        message:
          this.hasText(wechatPaySerialNo) &&
          this.hasText(wechatPayPrivateKeyPath) &&
          this.hasText(wechatPayApiV3Key)
            ? '微信支付证书序列号、私钥路径和 API v3 Key 已配置'
            : '请通过生产密钥系统配置证书序列号、私钥路径和 API v3 Key',
      },
      {
        id: 'wechatPay.notifyUrl',
        label: '微信支付通知 URL',
        status: this.isHttpsUrl(wechatPayNotifyUrl) ? 'PASS' : 'FAIL',
        message: this.isHttpsUrl(wechatPayNotifyUrl)
          ? '微信支付通知 URL 已配置为 HTTPS'
          : '请配置公网可访问的 HTTPS 支付通知 URL',
      },
    ];
  }

  private textCheck(
    id: string,
    label: string,
    value: unknown,
    passMessage: string,
    failMessage: string,
  ): ProductionReadinessCheck {
    return {
      id,
      label,
      status: this.hasText(value) ? 'PASS' : 'FAIL',
      message: this.hasText(value) ? passMessage : failMessage,
    };
  }

  private numberCheck(
    id: string,
    label: string,
    value: unknown,
    passMessage: string,
    failMessage: string,
  ): ProductionReadinessCheck {
    return {
      id,
      label,
      status:
        Number.isInteger(value) && typeof value === 'number' && value >= 0
          ? 'PASS'
          : 'FAIL',
      message:
        Number.isInteger(value) && typeof value === 'number' && value >= 0
          ? passMessage
          : failMessage,
    };
  }

  private urlCheck(
    id: string,
    label: string,
    value: unknown,
  ): ProductionReadinessCheck {
    const valid =
      typeof value === 'string' && /^https?:\/\/\S+$/u.test(value);
    return {
      id,
      label,
      status: valid ? 'PASS' : 'FAIL',
      message: valid ? `${label} 已配置` : `请填写有效的 ${label}`,
    };
  }

  private countCheck(
    id: string,
    label: string,
    count: number,
    passMessage: string,
    failMessage: string,
  ): ProductionReadinessCheck {
    return {
      id,
      label,
      status: count > 0 ? 'PASS' : 'FAIL',
      message: count > 0 ? passMessage : failMessage,
    };
  }

  private overallStatus(summary: {
    fail: number;
    warn: number;
  }): ProductionReadinessStatus {
    if (summary.fail > 0) {
      return 'FAIL';
    }
    if (summary.warn > 0) {
      return 'WARN';
    }
    return 'PASS';
  }

  private hasText(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private isHttpsUrl(value: unknown): value is string {
    return typeof value === 'string' && /^https:\/\/\S+$/u.test(value);
  }
}
