import { resolveApiBaseUrl } from '../config/api';
import { http, type HttpClient } from './http';

interface ApiModel {
  capabilities?: unknown;
  contextWindow?: unknown;
  description?: unknown;
  displayName?: unknown;
  inputUnit?: unknown;
  name?: unknown;
  outputUnit?: unknown;
  provider?: {
    displayName?: unknown;
    disclosurePurpose?: unknown;
    region?: unknown;
  };
  status?: unknown;
}

interface ApiPlan {
  applicableModelIds?: unknown;
  activationMode?: unknown;
  currency?: unknown;
  description?: unknown;
  inputQuota?: unknown;
  models?: unknown;
  name?: unknown;
  outputQuota?: unknown;
  priceMinor?: unknown;
  purchaseNotice?: unknown;
  refundPolicy?: unknown;
  unifiedQuota?: unknown;
  validityDays?: unknown;
}

interface ComplianceProfile {
  accountCancellationMethod?: unknown;
  businessDataRetentionDays?: unknown;
  complaintChannel?: unknown;
  contentSafetyRulesUrl?: unknown;
  customerServiceContact?: unknown;
  dataDeletionMethod?: unknown;
  dataExportMethod?: unknown;
  logRetentionDays?: unknown;
  operatorName?: unknown;
  privacyPolicyUrl?: unknown;
  productionEnabled?: unknown;
  providers?: unknown;
  serverRegion?: unknown;
  termsOfServiceUrl?: unknown;
}

interface ContentRule {
  action?: unknown;
  category?: unknown;
  name?: unknown;
}

export interface ModelListItem {
  billingText: string;
  capabilitiesText: string;
  contextText: string;
  description: string;
  displayName: string;
  name: string;
  providerText: string;
  statusText: string;
}

export interface PlanCard {
  activationText: string;
  applicableModelText: string;
  description: string;
  name: string;
  priceText: string;
  purchaseNotice: string;
  quotaText: string;
  refundPolicy: string;
  validityText: string;
}

export interface ComplianceView {
  accountCancellationMethod: string;
  businessDataRetentionText: string;
  complaintChannel: string;
  contentSafetyRulesUrl: string;
  customerServiceContact: string;
  dataDeletionMethod: string;
  dataExportMethod: string;
  isProductionReady: boolean;
  hasProviderRows: boolean;
  logRetentionText: string;
  operatorName: string;
  privacyPolicyUrl: string;
  providerRows: ProviderDisclosure[];
  serverRegion: string;
  termsOfServiceUrl: string;
}

export interface ProviderDisclosure {
  name: string;
  purpose: string;
  region: string;
}

export interface RuleRow {
  actionText: string;
  categoryText: string;
  name: string;
}

export interface ApiDocsView {
  authText: string;
  baseUrl: string;
  chatUrl: string;
  errors: Array<{ code: string; message: string }>;
  requestExample: string;
  responseExample: string;
}

export async function loadModels(
  client: HttpClient = http,
): Promise<ModelListItem[]> {
  const models = await client.request<ApiModel[]>({ url: '/public/models' });
  return mapModels(Array.isArray(models) ? models : []);
}

export async function loadPlans(
  client: HttpClient = http,
): Promise<PlanCard[]> {
  const plans = await client.request<ApiPlan[]>({ url: '/public/plans' });
  return mapPlans(Array.isArray(plans) ? plans : []);
}

export async function loadCompliance(
  client: HttpClient = http,
): Promise<ComplianceView> {
  const profile = await client.request<ComplianceProfile | null>({
    url: '/public/compliance',
  });
  return mapCompliance(profile);
}

export async function loadContentRules(
  client: HttpClient = http,
): Promise<RuleRow[]> {
  const rules = await client.request<ContentRule[]>({
    url: '/public/compliance/rules',
  });
  return mapContentRules(Array.isArray(rules) ? rules : []);
}

export function mapModels(models: ApiModel[]): ModelListItem[] {
  return models.map((model) => {
    const inputUnit = unitText(model.inputUnit);
    const outputUnit = unitText(model.outputUnit);

    return {
      billingText: `输入：${inputUnit}；输出：${outputUnit}`,
      capabilitiesText: listText(model.capabilities, '能力待完善'),
      contextText:
        numeric(model.contextWindow) > 0
          ? `上下文 ${numeric(model.contextWindow).toLocaleString('en-US')}`
          : '上下文待完善',
      description: text(model.description, '暂无模型说明'),
      displayName: text(model.displayName, '未命名模型'),
      name: text(model.name, 'unknown-model'),
      providerText: providerText(model.provider),
      statusText:
        model.status === 'AVAILABLE' || model.status === 'ACTIVE'
          ? '运行中'
          : '待确认',
    };
  });
}

export function mapPlans(plans: ApiPlan[]): PlanCard[] {
  return plans.map((plan) => ({
    activationText:
      plan.activationMode === 'ON_FIRST_USE'
        ? '首次调用后生效'
        : '购买后立即生效',
    applicableModelText: modelNamesText(plan.models),
    description: text(plan.description, '暂无套餐说明'),
    name: text(plan.name, '未命名套餐'),
    priceText: priceText(plan.priceMinor, plan.currency),
    purchaseNotice: text(plan.purchaseNotice, '购买前请确认套餐说明'),
    quotaText: quotaText(plan),
    refundPolicy: text(plan.refundPolicy, '退款条件待完善'),
    validityText: `有效期 ${Math.max(0, numeric(plan.validityDays))} 天`,
  }));
}

export function mapCompliance(
  profile: ComplianceProfile | null | undefined,
): ComplianceView {
  const providers = Array.isArray(profile?.providers)
    ? profile.providers
    : [];

  return {
    accountCancellationMethod: text(
      profile?.accountCancellationMethod,
      '账号注销方式待完善',
    ),
    businessDataRetentionText: retentionText(
      profile?.businessDataRetentionDays,
      '业务数据保存期限待完善',
    ),
    complaintChannel: text(profile?.complaintChannel, '投诉入口待完善'),
    contentSafetyRulesUrl: text(profile?.contentSafetyRulesUrl, ''),
    customerServiceContact: text(
      profile?.customerServiceContact,
      '客服联系方式待完善',
    ),
    dataDeletionMethod: text(
      profile?.dataDeletionMethod,
      '数据删除方式待完善',
    ),
    dataExportMethod: text(profile?.dataExportMethod, '数据导出方式待完善'),
    isProductionReady: profile?.productionEnabled === true,
    hasProviderRows: providers.length > 0,
    logRetentionText: retentionText(
      profile?.logRetentionDays,
      '调用日志保存期限待完善',
    ),
    operatorName: text(profile?.operatorName, '经营主体待完善'),
    privacyPolicyUrl: text(profile?.privacyPolicyUrl, ''),
    providerRows: providers.map((provider) => {
      const row = provider as Record<string, unknown>;
      return {
        name: text(row.name, '模型供应商待完善'),
        purpose: text(row.purpose, '用途待完善'),
        region: text(row.region, '地区待完善'),
      };
    }),
    serverRegion: text(profile?.serverRegion, '服务器地区待完善'),
    termsOfServiceUrl: text(profile?.termsOfServiceUrl, ''),
  };
}

export function mapContentRules(rules: ContentRule[]): RuleRow[] {
  return rules.map((rule) => ({
    actionText: actionText(rule.action),
    categoryText: categoryText(rule.category),
    name: text(rule.name, '未命名规则'),
  }));
}

export function createApiDocsView(baseUrl = resolveApiBaseUrl()): ApiDocsView {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');

  return {
    authText: 'Authorization: Bearer sk-gw_xxx，示例 Key 固定脱敏',
    baseUrl: normalizedBaseUrl,
    chatUrl: `${normalizedBaseUrl}/v1/chat/completions`,
    errors: [
      { code: '400', message: '参数错误' },
      { code: '401', message: 'API Key 无效或已停用' },
      { code: '402', message: '套餐额度不足或订单未支付' },
      { code: '429', message: '触发频率限制' },
      { code: '500', message: '服务暂不可用，请稍后重试' },
    ],
    requestExample: JSON.stringify(
      {
        messages: [{ content: '你好', role: 'user' }],
        model: 'your-model-name',
        stream: false,
      },
      null,
      2,
    ),
    responseExample: JSON.stringify(
      {
        choices: [
          {
            message: {
              content: '模型返回内容',
              role: 'assistant',
            },
          },
        ],
      },
      null,
      2,
    ),
  };
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function numeric(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function listText(value: unknown, fallback: string): string {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return items.length > 0 ? items.join('、') : fallback;
}

function unitText(value: unknown): string {
  return value === 'CHARACTER' ? '字符' : '计费单位待完善';
}

function providerText(provider: ApiModel['provider']): string {
  if (!provider) {
    return '供应商披露待完善';
  }

  const name = text(provider.displayName, '供应商待完善');
  const region = text(provider.region, '地区待完善');
  const purpose = text(provider.disclosurePurpose, '用途待完善');
  return `${name} / ${region} / ${purpose}`;
}

function priceText(priceMinor: unknown, currency: unknown): string {
  const amount = numeric(priceMinor);
  if (amount === 0) {
    return '免费';
  }

  const symbol = currency === 'CNY' ? '¥' : `${text(currency, 'CNY')} `;
  return `${symbol}${(amount / 100).toFixed(2)}`;
}

function quotaText(plan: ApiPlan): string {
  const unifiedQuota = numeric(plan.unifiedQuota);
  if (unifiedQuota > 0) {
    return `${compactNumber(unifiedQuota)}通用字符`;
  }

  const inputQuota = numeric(plan.inputQuota);
  const outputQuota = numeric(plan.outputQuota);
  return `输入 ${compactNumber(inputQuota)}字符 / 输出 ${compactNumber(outputQuota)}字符`;
}

function modelNamesText(value: unknown): string {
  if (!Array.isArray(value)) {
    return '适用模型待完善';
  }

  const names = value
    .map((model) =>
      typeof model === 'object' && model !== null
        ? text((model as { displayName?: unknown }).displayName, '')
        : '',
    )
    .filter((name) => name.length > 0);

  return names.length > 0 ? names.join('、') : '适用模型待完善';
}

function compactNumber(value: number): string {
  if (value >= 10_000) {
    return `${value / 10_000}${Number.isInteger(value / 10_000) ? '' : ''} 万`;
  }

  return Math.max(0, Math.round(value)).toLocaleString('en-US');
}

function retentionText(value: unknown, fallback: string): string {
  const days = numeric(value);
  return days >= 0 && typeof value === 'number' ? `${days} 天` : fallback;
}

function categoryText(value: unknown): string {
  const mapping: Record<string, string> = {
    ABUSE: '批量滥用',
    ATTACK: '攻击行为',
    FRAUD: '诈骗内容',
    ILLEGAL: '违法内容',
    INFRINGEMENT: '侵权内容',
  };

  return typeof value === 'string' && mapping[value]
    ? mapping[value]
    : '规则分类待确认';
}

function actionText(value: unknown): string {
  return value === 'BLOCK' ? '阻断请求' : '人工复核或限制';
}
