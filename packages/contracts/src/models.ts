import type { ErrorCode } from './errors';

export type IsoDateTime = string;
export type CurrencyCode = string;

export type ModelStatus = 'AVAILABLE' | 'UNAVAILABLE';
export type BillingUnit = 'CHARACTER';

export interface ModelDto {
  id: string;
  name: string;
  displayName: string;
  description: string;
  capabilities?: string[];
  inputUnit: BillingUnit;
  outputUnit: BillingUnit;
  contextWindow: number;
  status: ModelStatus;
}

export type PlanStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE';
export type PlanActivationMode = 'IMMEDIATE' | 'ON_FIRST_USE';

export interface PlanDto {
  id: string;
  name: string;
  description: string;
  priceMinor: number;
  currency: CurrencyCode;
  inputQuota: number;
  outputQuota: number;
  applicableModelIds: string[];
  activationMode: PlanActivationMode;
  validityDays: number;
  refundPolicy: string;
  purchaseNotice: string;
  status: PlanStatus;
}

export interface UsageSummaryDto {
  periodStart: IsoDateTime;
  periodEnd: IsoDateTime;
  callCount: number;
  inputCharacters: number;
  outputCharacters: number;
  chargedUnits: number;
  remainingUnits: number;
}

export interface ApiCallLogDto {
  id: string;
  requestId: string;
  apiKeyLabel: string;
  modelId: string;
  modelName: string;
  inputCharacters: number;
  outputCharacters: number;
  chargedUnits: number;
  httpStatus: number;
  errorCode?: ErrorCode;
  durationMs: number;
  upstreamRequestId?: string;
  errorSummary?: string;
  createdAt: IsoDateTime;
}

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'FULFILLED'
  | 'CANCELLED'
  | 'REFUND_PENDING'
  | 'REFUNDED'
  | 'REFUND_REJECTED';
export type PaymentDriver = 'TEST' | 'WECHAT';

export interface OrderDto {
  id: string;
  orderNumber: string;
  planId: string;
  planName: string;
  amountMinor: number;
  currency: CurrencyCode;
  status: OrderStatus;
  paymentDriver: PaymentDriver;
  createdAt: IsoDateTime;
  paidAt?: IsoDateTime;
  fulfilledAt?: IsoDateTime;
}

export type RefundStatus =
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'REFUNDED';

export interface RefundDto {
  id: string;
  orderId: string;
  amountMinor: number;
  currency: CurrencyCode;
  reason: string;
  status: RefundStatus;
  createdAt: IsoDateTime;
  reviewedAt?: IsoDateTime;
  completedAt?: IsoDateTime;
}

export type InvoiceStatus =
  | 'SUBMITTED'
  | 'APPROVED'
  | 'ISSUED'
  | 'REJECTED';

export interface InvoiceDto {
  id: string;
  orderIds: string[];
  title: string;
  taxNumber?: string;
  amountMinor: number;
  currency: CurrencyCode;
  status: InvoiceStatus;
  createdAt: IsoDateTime;
  reviewedAt?: IsoDateTime;
  issuedAt?: IsoDateTime;
}

export interface ProviderDisclosureDto {
  name: string;
  purpose: string;
  region: string;
}

export interface ComplianceProfileDto {
  operatorName: string;
  customerServiceContact: string;
  complaintChannel: string;
  serverRegion: string;
  providers: ProviderDisclosureDto[];
  logRetentionDays: number;
  businessDataRetentionDays: number;
  dataExportMethod: string;
  dataDeletionMethod: string;
  accountCancellationMethod: string;
  privacyPolicyUrl: string;
  termsOfServiceUrl: string;
  contentSafetyRulesUrl: string;
  updatedAt: IsoDateTime;
}
