import { SetMetadata } from '@nestjs/common';

export const AUDITED_ACTION_METADATA = 'audited_action';

export interface AuditRequest {
  body?: Record<string, unknown>;
  params?: Record<string, string | undefined>;
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  user?: {
    sub: string;
    role: string;
    type: 'admin';
  };
}

export interface AuditedActionContext {
  request: AuditRequest;
  result: unknown;
}

type AuditValueSelector =
  | string
  | ((context: AuditedActionContext) => unknown);

export interface AuditedActionOptions {
  action: string;
  resourceType: string;
  resourceId?: AuditValueSelector;
  beforeSummary?: AuditValueSelector;
  afterSummary?: AuditValueSelector;
}

/**
 * Adds post-handler observation audit metadata. Sensitive database mutations
 * must use AuditService.runInAuditedTransaction. This decorator does not make
 * handler database writes atomic with the audit observation.
 */
export const AuditedAction = (
  options: AuditedActionOptions,
): MethodDecorator => SetMetadata(AUDITED_ACTION_METADATA, options);
