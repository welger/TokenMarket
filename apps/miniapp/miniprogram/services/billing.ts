import { http, type HttpClient } from './http';

interface UsageSummaryResponse {
  callCount?: unknown;
  chargedUnits?: unknown;
  inputCharacters?: unknown;
  outputCharacters?: unknown;
  periodEnd?: unknown;
  periodStart?: unknown;
  remainingUnits?: unknown;
}

interface PageResponse<T> {
  items?: unknown;
  total?: unknown;
}

interface ApiCallResponse {
  chargedUnits?: unknown;
  createdAt?: unknown;
  durationMs?: unknown;
  httpStatus?: unknown;
  inputCharacters?: unknown;
  modelName?: unknown;
  outputCharacters?: unknown;
  requestId?: unknown;
}

interface UserPlanResponse {
  expiresAt?: unknown;
  id?: unknown;
  plan?: {
    name?: unknown;
  };
  remainingInputQuota?: unknown;
  remainingOutputQuota?: unknown;
  remainingUnifiedQuota?: unknown;
  status?: unknown;
}

interface OrderResponse {
  amountMinor?: unknown;
  createdAt?: unknown;
  currency?: unknown;
  id?: unknown;
  orderNumber?: unknown;
  paymentDriver?: unknown;
  plan?: { name?: unknown };
  status?: unknown;
}

interface InvoiceResponse {
  createdAt?: unknown;
  id?: unknown;
  status?: unknown;
  title?: unknown;
}

interface RefundResponse {
  amountMinor?: unknown;
  createdAt?: unknown;
  id?: unknown;
  reason?: unknown;
  status?: unknown;
}

interface WechatPaymentParamsResponse {
  nonceStr?: unknown;
  package?: unknown;
  paySign?: unknown;
  signType?: unknown;
  timeStamp?: unknown;
}

export interface UsageDashboard {
  callCount: string;
  chargedUnits: string;
  hasPlanRows: boolean;
  inputCharacters: string;
  outputCharacters: string;
  periodText: string;
  planRows: UserPlanRow[];
  remainingUnits: string;
}

export interface ApiCallRow {
  chargedUnits: string;
  charactersText: string;
  createdAtText: string;
  durationText: string;
  httpStatusText: string;
  modelName: string;
  requestId: string;
}

export interface UserPlanRow {
  expiresAtText: string;
  name: string;
  remainingText: string;
  statusText: string;
}

export interface OrderRow {
  amountText: string;
  canPayWechat: boolean;
  createdAtText: string;
  id: string;
  orderNumber: string;
  paymentText: string;
  planName: string;
  statusText: string;
}

export interface InvoiceRow {
  createdAtText: string;
  id: string;
  statusText: string;
  title: string;
}

export interface RefundRow {
  amountText: string;
  createdAtText: string;
  id: string;
  reason: string;
  statusText: string;
}

export interface WechatPaymentParams {
  nonceStr: string;
  package: string;
  paySign: string;
  signType: 'RSA';
  timeStamp: string;
}

export async function loadUsageDashboard(
  client: HttpClient = http,
): Promise<UsageDashboard> {
  const [summary, plans] = await Promise.all([
    client.request<UsageSummaryResponse>({ url: '/me/usage/summary' }),
    client.request<PageResponse<UserPlanResponse>>({
      url: '/me/plans?page=1&pageSize=20',
    }),
  ]);

  return mapUsageDashboard(
    summary,
    Array.isArray(plans.items) ? plans.items as UserPlanResponse[] : [],
  );
}

export async function loadCallLogs(
  client: HttpClient = http,
): Promise<ApiCallRow[]> {
  const response = await client.request<PageResponse<ApiCallResponse>>({
    url: '/me/api-calls?page=1&pageSize=20',
  });
  return mapApiCalls(
    Array.isArray(response.items) ? response.items as ApiCallResponse[] : [],
  );
}

export async function loadOrders(
  client: HttpClient = http,
): Promise<OrderRow[]> {
  const orders = await client.request<OrderResponse[]>({
    url: '/me/orders',
  });
  return mapOrders(Array.isArray(orders) ? orders : []);
}

export async function loadInvoices(
  client: HttpClient = http,
): Promise<InvoiceRow[]> {
  const invoices = await client.request<InvoiceResponse[]>({
    url: '/me/invoices',
  });
  return mapInvoices(Array.isArray(invoices) ? invoices : []);
}

export async function loadRefunds(
  client: HttpClient = http,
): Promise<RefundRow[]> {
  const refunds = await client.request<RefundResponse[]>({
    url: '/me/refunds',
  });
  return mapRefunds(Array.isArray(refunds) ? refunds : []);
}

export async function createPlanOrder(
  planId: string,
  client: HttpClient = http,
): Promise<OrderRow> {
  const order = await client.request<OrderResponse>({
    method: 'POST',
    url: '/me/orders',
    data: {
      idempotencyKey: createIdempotencyKey(planId),
      planId,
    },
  });
  return mapOrders([order])[0];
}

export async function payWechatOrder(
  orderId: string,
  client: HttpClient = http,
): Promise<void> {
  const params = mapWechatPaymentParams(
    await client.request<WechatPaymentParamsResponse>({
      method: 'POST',
      url: `/me/orders/${encodeURIComponent(orderId)}/pay-wechat`,
    }),
  );

  await requestWechatPayment(params);
}

export function mapUsageDashboard(
  summary: UsageSummaryResponse,
  plans: UserPlanResponse[],
): UsageDashboard {
  return {
    callCount: numberText(summary.callCount),
    chargedUnits: `${compactNumber(numeric(summary.chargedUnits))} 字符`,
    hasPlanRows: plans.length > 0,
    inputCharacters: `${compactNumber(numeric(summary.inputCharacters))} 字符`,
    outputCharacters: `${compactNumber(numeric(summary.outputCharacters))} 字符`,
    periodText: periodText(summary.periodStart, summary.periodEnd),
    planRows: plans.map(mapUserPlan),
    remainingUnits: `${compactNumber(numeric(summary.remainingUnits))} 字符`,
  };
}

export function mapApiCalls(calls: ApiCallResponse[]): ApiCallRow[] {
  return calls.map((call) => ({
    chargedUnits: `${compactNumber(numeric(call.chargedUnits))} 字符`,
    charactersText: `输入 ${numberText(call.inputCharacters)} / 输出 ${numberText(call.outputCharacters)}`,
    createdAtText: dateTimeText(call.createdAt),
    durationText: `${numberText(call.durationMs)} ms`,
    httpStatusText: numberText(call.httpStatus),
    modelName: text(call.modelName, '模型待确认'),
    requestId: text(call.requestId, 'request-id 待确认'),
  }));
}

export function mapOrders(orders: OrderResponse[]): OrderRow[] {
  return orders.map((order) => ({
    amountText: priceText(order.amountMinor, order.currency),
    canPayWechat:
      order.paymentDriver === 'WECHAT' &&
      order.status === 'PENDING_PAYMENT' &&
      text(order.id, '').length > 0,
    createdAtText: dateText(order.createdAt),
    id: text(order.id, ''),
    orderNumber: text(order.orderNumber, '订单号待确认'),
    paymentText:
      order.paymentDriver === 'TEST'
        ? '测试支付'
        : order.paymentDriver === 'WECHAT'
          ? '微信支付'
          : '支付方式待确认',
    planName: text(order.plan?.name, '套餐待确认'),
    statusText: orderStatusText(order.status),
  }));
}

function mapWechatPaymentParams(
  response: WechatPaymentParamsResponse,
): WechatPaymentParams {
  if (
    typeof response.timeStamp !== 'string' ||
    typeof response.nonceStr !== 'string' ||
    typeof response.package !== 'string' ||
    response.signType !== 'RSA' ||
    typeof response.paySign !== 'string' ||
    response.timeStamp.trim().length === 0 ||
    response.nonceStr.trim().length === 0 ||
    response.package.trim().length === 0 ||
    response.paySign.trim().length === 0
  ) {
    throw new Error('微信支付参数无效，请稍后重试');
  }

  return {
    nonceStr: response.nonceStr.trim(),
    package: response.package.trim(),
    paySign: response.paySign.trim(),
    signType: 'RSA',
    timeStamp: response.timeStamp.trim(),
  };
}

function createIdempotencyKey(planId: string): string {
  return [
    'miniapp',
    planId,
    Date.now().toString(36),
    Math.random().toString(36).slice(2, 12),
  ].join('-');
}

function requestWechatPayment(
  params: WechatPaymentParams,
): Promise<void> {
  return new Promise((resolve, reject) => {
    wx.requestPayment({
      ...params,
      fail: (error) => {
        const errMsg =
          typeof error.errMsg === 'string' ? error.errMsg : '';
        reject(
          new Error(
            errMsg.includes('cancel')
              ? '支付未完成，可稍后在订单中心继续支付'
              : '微信支付未完成，请稍后重试或联系客服',
          ),
        );
      },
      success: () => {
        resolve();
      },
    });
  });
}

export function mapInvoices(invoices: InvoiceResponse[]): InvoiceRow[] {
  return invoices.map((invoice) => ({
    createdAtText: dateText(invoice.createdAt),
    id: text(invoice.id, ''),
    statusText: invoiceStatusText(invoice.status),
    title: text(invoice.title, '发票抬头待确认'),
  }));
}

export function mapRefunds(refunds: RefundResponse[]): RefundRow[] {
  return refunds.map((refund) => ({
    amountText: priceText(refund.amountMinor, 'CNY'),
    createdAtText: dateText(refund.createdAt),
    id: text(refund.id, ''),
    reason: text(refund.reason, '退款原因待确认'),
    statusText: refundStatusText(refund.status),
  }));
}

function mapUserPlan(plan: UserPlanResponse): UserPlanRow {
  const remainingUnified = numeric(plan.remainingUnifiedQuota);
  const splitRemaining =
    numeric(plan.remainingInputQuota) + numeric(plan.remainingOutputQuota);
  const remaining = remainingUnified > 0 ? remainingUnified : splitRemaining;

  return {
    expiresAtText: plan.expiresAt ? `到期：${dateText(plan.expiresAt)}` : '未激活或无固定到期日',
    name: text(plan.plan?.name, '套餐待确认'),
    remainingText: `${compactNumber(remaining)} 字符`,
    statusText: userPlanStatusText(plan.status),
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

function numberText(value: unknown): string {
  return numeric(value).toLocaleString('en-US');
}

function compactNumber(value: number): string {
  if (value >= 10_000) {
    const textValue = (value / 10_000).toFixed(1).replace(/\.0$/, '');
    return `${textValue} 万`;
  }
  return numberText(value);
}

function dateText(value: unknown): string {
  if (typeof value !== 'string' && !(value instanceof Date)) {
    return '时间待确认';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '时间待确认';
  }
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function dateTimeText(value: unknown): string {
  if (typeof value !== 'string' && !(value instanceof Date)) {
    return '时间待确认';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '时间待确认';
  }
  return `${dateText(date)} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function periodText(startValue: unknown, endValue: unknown): string {
  if (typeof startValue !== 'string' || typeof endValue !== 'string') {
    return '统计周期待确认';
  }
  const start = new Date(startValue);
  const end = new Date(new Date(endValue).getTime() - 24 * 60 * 60 * 1000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return '统计周期待确认';
  }
  return `${start.getUTCMonth() + 1}.${start.getUTCDate()} - ${end.getUTCMonth() + 1}.${end.getUTCDate()}`;
}

function priceText(value: unknown, currency: unknown): string {
  const amount = numeric(value);
  const symbol = currency === 'CNY' ? '¥' : `${text(currency, 'CNY')} `;
  return `${symbol}${(amount / 100).toFixed(2)}`;
}

function userPlanStatusText(value: unknown): string {
  const mapping: Record<string, string> = {
    ACTIVE: '生效中',
    CANCELLED: '已取消',
    EXHAUSTED: '已用尽',
    EXPIRED: '已过期',
    PENDING: '待激活',
  };
  return typeof value === 'string' && mapping[value]
    ? mapping[value]
    : '状态待确认';
}

function orderStatusText(value: unknown): string {
  const mapping: Record<string, string> = {
    CANCELLED: '已取消',
    FULFILLED: '已发放',
    PAID: '已支付',
    PENDING_PAYMENT: '待支付',
    REFUNDED: '已退款',
    REFUND_PENDING: '退款处理中',
    REFUND_REJECTED: '退款驳回',
  };
  return typeof value === 'string' && mapping[value]
    ? mapping[value]
    : '订单状态待确认';
}

function invoiceStatusText(value: unknown): string {
  const mapping: Record<string, string> = {
    APPROVED: '已审核',
    ISSUED: '已开具',
    REJECTED: '已驳回',
    SUBMITTED: '已提交',
  };
  return typeof value === 'string' && mapping[value]
    ? mapping[value]
    : '发票状态待确认';
}

function refundStatusText(value: unknown): string {
  const mapping: Record<string, string> = {
    APPROVED: '已审核',
    REFUNDED: '测试退款已完成',
    REJECTED: '已驳回',
    SUBMITTED: '已提交',
  };
  return typeof value === 'string' && mapping[value]
    ? mapping[value]
    : '退款状态待确认';
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}
