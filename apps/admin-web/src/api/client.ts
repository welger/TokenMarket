export interface PlatformError {
  code: string;
  message: string;
  requestId?: string;
  status: number;
}

const TOKEN_KEY = "gateway-admin-access-token";
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

export function getAdminToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = getAdminToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const requestId = response.headers.get("x-request-id") ?? undefined;
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      clearAdminToken();
      window.dispatchEvent(new Event("admin-session-expired"));
    }
    const error = body?.error ?? body;
    throw {
      code:
        typeof error?.code === "string"
          ? error.code
          : `HTTP_${response.status}`,
      message:
        typeof error?.message === "string"
          ? error.message
          : "请求失败，请稍后重试",
      requestId:
        typeof error?.requestId === "string"
          ? error.requestId
          : requestId,
      status: response.status,
    } satisfies PlatformError;
  }

  return body as T;
}

export interface ComplianceProfile {
  operatorName: string;
  customerServiceContact: string;
  complaintChannel: string;
  serverRegion: string;
  logRetentionDays: number;
  businessDataRetentionDays: number;
  dataExportMethod: string;
  dataDeletionMethod: string;
  accountCancellationMethod: string;
  privacyPolicyUrl: string;
  termsOfServiceUrl: string;
  contentSafetyRulesUrl: string;
  productionEnabled: boolean;
  updatedAt?: string;
}

export type ProductionReadinessStatus = "PASS" | "WARN" | "FAIL";

export interface ProductionReadinessCheck {
  id: string;
  label: string;
  status: ProductionReadinessStatus;
  message: string;
}

export interface ProductionReadinessResult {
  status: ProductionReadinessStatus;
  generatedAt: string;
  summary: {
    pass: number;
    warn: number;
    fail: number;
  };
  checks: ProductionReadinessCheck[];
}

export interface ProviderRecord {
  id: string;
  name: string;
  displayName: string;
  configRef: string;
  disclosurePurpose: string;
  region: string;
  status: "ACTIVE" | "INACTIVE";
  routingPriority: number;
  updatedAt: string;
}

export interface ModelRecord {
  id: string;
  providerId: string;
  name: string;
  upstreamModel: string;
  displayName: string;
  description: string;
  capabilities: string[];
  contextWindow: number;
  inputMultiplier: string | number;
  outputMultiplier: string | number;
  routingPriority: number;
  status: "AVAILABLE" | "UNAVAILABLE";
  provider: ProviderRecord;
  updatedAt: string;
}

export interface PlanRecord {
  id: string;
  name: string;
  description: string;
  priceMinor: number;
  currency: string;
  inputQuota: number | null;
  outputQuota: number | null;
  unifiedQuota: number | null;
  activationMode: "IMMEDIATE" | "ON_FIRST_USE";
  validityDays: number;
  refundPolicy: string;
  purchaseNotice: string;
  status: "DRAFT" | "ACTIVE" | "INACTIVE";
  models: ModelRecord[];
  updatedAt: string;
}

export interface OrderRecord {
  id: string;
  orderNumber: string;
  amountMinor: number;
  currency: string;
  status: string;
  paymentDriver: string;
  createdAt: string;
  plan: PlanRecord;
  user: { id: string };
}

export interface RefundRecord {
  id: string;
  orderId: string;
  amountMinor: number;
  currency: string;
  reason: string;
  status: string;
  createdAt: string;
  order: OrderRecord;
}

export interface InvoiceRecord {
  id: string;
  title: string;
  taxNumber?: string;
  amountMinor: number;
  currency: string;
  status: string;
  createdAt: string;
  user: { id: string };
}

export const adminApi = {
  login(username: string, password: string) {
    return request<{ accessToken: string }>("/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  getComplianceProfile() {
    return request<ComplianceProfile | null>("/admin/compliance");
  },
  getProductionReadiness() {
    return request<ProductionReadinessResult>(
      "/admin/compliance/production-readiness",
    );
  },
  updateComplianceProfile(values: Partial<ComplianceProfile>) {
    return request<ComplianceProfile>("/admin/compliance", {
      method: "PUT",
      body: JSON.stringify(values),
    });
  },
  enableProduction() {
    return request<ComplianceProfile>(
      "/admin/compliance/enable-production",
      { method: "POST", body: JSON.stringify({}) },
    );
  },
  listProviders() {
    return request<ProviderRecord[]>("/admin/providers");
  },
  createProvider(values: Omit<ProviderRecord, "id" | "updatedAt">) {
    return request<ProviderRecord>("/admin/providers", {
      method: "POST",
      body: JSON.stringify(values),
    });
  },
  updateProvider(id: string, values: Partial<ProviderRecord>) {
    return request<ProviderRecord>(`/admin/providers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(values),
    });
  },
  listModels() {
    return request<ModelRecord[]>("/admin/models");
  },
  createModel(values: Record<string, unknown>) {
    return request<ModelRecord>("/admin/models", {
      method: "POST",
      body: JSON.stringify(values),
    });
  },
  updateModel(id: string, values: Record<string, unknown>) {
    return request<ModelRecord>(`/admin/models/${id}`, {
      method: "PATCH",
      body: JSON.stringify(values),
    });
  },
  listPlans() {
    return request<PlanRecord[]>("/admin/plans");
  },
  createPlan(values: Record<string, unknown>) {
    return request<PlanRecord>("/admin/plans", {
      method: "POST",
      body: JSON.stringify(values),
    });
  },
  updatePlan(id: string, values: Record<string, unknown>) {
    return request<PlanRecord>(`/admin/plans/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ ...values, confirm: true }),
    });
  },
  listOrders() {
    return request<OrderRecord[]>("/admin/orders");
  },
  payTestOrder(id: string) {
    return request(`/admin/orders/${id}/pay-test`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
  listRefunds() {
    return request<RefundRecord[]>("/admin/refunds");
  },
  reviewRefund(id: string, decision: "APPROVE" | "REJECT") {
    return request(`/admin/refunds/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ decision, confirm: true }),
    });
  },
  completeTestRefund(id: string) {
    return request(`/admin/refunds/${id}/complete-test`, {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    });
  },
  listInvoices() {
    return request<InvoiceRecord[]>("/admin/invoices");
  },
  reviewInvoice(id: string, decision: "APPROVE" | "REJECT") {
    return request(`/admin/invoices/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ decision, confirm: true }),
    });
  },
  issueInvoice(id: string) {
    return request(`/admin/invoices/${id}/issue`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
};
