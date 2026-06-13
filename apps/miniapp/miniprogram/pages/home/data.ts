import { http, type HttpClient } from '../../services/http';

interface ApiModel {
  displayName?: unknown;
  name?: unknown;
  status?: unknown;
}

interface ComplianceProfile {
  operatorName?: unknown;
  productionEnabled?: unknown;
}

interface UsageSummary {
  chargedUnits?: unknown;
  callCount?: unknown;
  inputCharacters?: unknown;
  outputCharacters?: unknown;
  remainingUnits?: unknown;
  periodStart?: unknown;
  periodEnd?: unknown;
}

interface UserPlans {
  items?: unknown;
  total?: unknown;
}

export interface HomeSourceData {
  compliance?: ComplianceProfile | null;
  models?: ApiModel[];
  plans?: UserPlans;
  usage?: UsageSummary;
}

export interface HomeModelRow {
  displayName: string;
  icon: string;
  name: string;
  statusTone: string;
  statusText: string;
}

export interface HomeUsageView {
  callCount: string;
  inputCharacters: string;
  outputCharacters: string;
  remainingUnits: string;
  trendText: string;
}

export interface HomeDashboard {
  hasPlans: boolean;
  hasModels: boolean;
  modelEmptyText: string;
  modelError: string;
  models: HomeModelRow[];
  operatorText: string;
  operatorTone: string;
  operatorWarning: boolean;
  pageError: string;
  periodText: string;
  planEmptyText: string;
  serviceStatusText: string;
  usage: HomeUsageView;
  usageError: string;
}

const DEFAULT_USAGE: HomeUsageView = {
  callCount: '0',
  inputCharacters: '0 字符',
  outputCharacters: '0 字符',
  remainingUnits: '0',
  trendText: '',
};

type SectionResult<T> =
  | { ok: true; value: T }
  | { ok: false };

export async function loadHomeDashboard(
  client: HttpClient = http,
): Promise<HomeDashboard> {
  const [models, compliance, usage, plans] = await Promise.all([
    settle(client.request<ApiModel[]>({ url: '/public/models' })),
    settle(client.request<ComplianceProfile | null>({
      url: '/public/compliance',
    })),
    settle(client.request<UsageSummary>({ url: '/me/usage/summary' })),
    settle(
      client.request<UserPlans>({
        url: '/me/plans?page=1&pageSize=1',
      }),
    ),
  ]);

  return mapHomeDashboard(
    {
      compliance: compliance.ok ? compliance.value : null,
      models: models.ok && Array.isArray(models.value) ? models.value : [],
      plans: plans.ok ? plans.value : undefined,
      usage: usage.ok ? usage.value : undefined,
    },
    {
      modelError: models.ok ? '' : '模型状态暂时无法加载',
      usageError: usage.ok ? '' : '用量暂时无法加载',
    },
  );
}

export function mapHomeDashboard(
  source: HomeSourceData,
  errors: { modelError?: string; usageError?: string } = {},
): HomeDashboard {
  const operatorName =
    typeof source.compliance?.operatorName === 'string'
      ? source.compliance.operatorName.trim()
      : '';
  const productionEnabled = source.compliance?.productionEnabled === true;
  const models = (source.models ?? []).slice(0, 2).map((model, index) => {
    const available =
      model.status === 'AVAILABLE' || model.status === 'ACTIVE';

    return {
      displayName: text(model.displayName, '未命名模型'),
      icon:
        index === 0
          ? '/assets/icons/model-primary.png'
          : '/assets/icons/model-secondary.png',
      name: text(model.name, 'unknown-model'),
      statusTone: available ? 'success' : 'muted',
      statusText: available ? '运行中' : '待确认',
    };
  });
  const totalPlans =
    typeof source.plans?.total === 'number' ? source.plans.total : 0;
  const planItems = Array.isArray(source.plans?.items)
    ? source.plans.items
    : [];
  const hasPlans = totalPlans > 0 || planItems.length > 0;

  return {
    hasPlans,
    hasModels: models.length > 0,
    modelEmptyText: models.length === 0 ? '暂无可用模型' : '',
    modelError: errors.modelError ?? '',
    models,
    operatorText: operatorName || '经营主体待完善',
    operatorTone:
      !productionEnabled || operatorName.length === 0
        ? 'warning'
        : 'success',
    operatorWarning: !productionEnabled || operatorName.length === 0,
    pageError: '',
    periodText: periodText(source.usage),
    planEmptyText: hasPlans ? '' : '暂无可用套餐',
    serviceStatusText:
      errors.modelError || models.length === 0
        ? '服务状态待确认'
        : '服务运行正常',
    usage: usageView(source.usage),
    usageError: errors.usageError ?? '',
  };
}

async function settle<T>(promise: Promise<T>): Promise<SectionResult<T>> {
  try {
    return { ok: true, value: await promise };
  } catch {
    return { ok: false };
  }
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function numeric(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function usageView(usage?: UsageSummary): HomeUsageView {
  if (!usage) {
    return DEFAULT_USAGE;
  }

  return {
    callCount: numeric(usage.callCount).toLocaleString('en-US'),
    inputCharacters: characterText(numeric(usage.inputCharacters)),
    outputCharacters: characterText(numeric(usage.outputCharacters)),
    remainingUnits: compactNumber(numeric(usage.remainingUnits)),
    trendText: '',
  };
}

function characterText(value: number): string {
  if (value >= 10_000) {
    return `${trimDecimal(value / 10_000)} 万字符`;
  }

  return `${Math.max(0, Math.round(value)).toLocaleString('en-US')} 字符`;
}

function compactNumber(value: number): string {
  if (value >= 10_000) {
    return `${trimDecimal(value / 10_000)} 万`;
  }

  return Math.max(0, Math.round(value)).toLocaleString('en-US');
}

function trimDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '');
}

function periodText(usage?: UsageSummary): string {
  if (
    typeof usage?.periodStart !== 'string' ||
    typeof usage.periodEnd !== 'string'
  ) {
    return '';
  }

  const start = new Date(usage.periodStart);
  const exclusiveEnd = new Date(usage.periodEnd);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(exclusiveEnd.getTime())
  ) {
    return '';
  }

  const end = new Date(exclusiveEnd.getTime() - 24 * 60 * 60 * 1000);
  return `统计周期：${start.getUTCMonth() + 1}.${start.getUTCDate()} - ${end.getUTCMonth() + 1}.${end.getUTCDate()}`;
}
