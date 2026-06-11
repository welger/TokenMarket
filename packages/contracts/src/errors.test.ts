import { describe, expect, it } from 'vitest';

import { ErrorCode, errorResponse } from './errors';
import type {
  ApiCallLogDto,
  ComplianceProfileDto,
  InvoiceDto,
  ModelDto,
  OrderDto,
  PlanDto,
  RefundDto,
  UsageSummaryDto,
} from './models';

describe('public error contract', () => {
  it('returns a stable public error shape', () => {
    expect(errorResponse(ErrorCode.API_KEY_DISABLED, 'req_1')).toEqual({
      error: {
        code: 'API_KEY_DISABLED',
        message: 'API Key 已停用',
        requestId: 'req_1',
      },
    });
  });

  it('exposes only the fixed public error codes', () => {
    expect(Object.values(ErrorCode)).toEqual([
      'UNAUTHORIZED',
      'API_KEY_DISABLED',
      'QUOTA_EXHAUSTED',
      'MODEL_UNAVAILABLE',
      'RATE_LIMITED',
      'CONTENT_REJECTED',
      'UPSTREAM_TIMEOUT',
      'INTERNAL_ERROR',
    ]);
  });
});

type PublicDto =
  | ModelDto
  | PlanDto
  | UsageSummaryDto
  | ApiCallLogDto
  | OrderDto
  | RefundDto
  | InvoiceDto
  | ComplianceProfileDto;

type SensitiveField =
  | 'passwordHash'
  | 'keyHash'
  | 'apiKeyHash'
  | 'upstreamApiKey'
  | 'upstreamKey'
  | 'prompt'
  | 'fullPrompt'
  | 'response'
  | 'fullResponse';

type AssertNever<T extends never> = T;
type KeysOfUnion<T> = T extends T ? keyof T : never;
type PublicDtosDoNotExposeSensitiveFields = AssertNever<
  Extract<KeysOfUnion<PublicDto>, SensitiveField>
>;

describe('public DTO safety', () => {
  it('does not serialize secrets or full model content', () => {
    const model: ModelDto = {
      id: 'model_1',
      name: 'test-model',
      displayName: '测试模型',
      description: '用于契约测试的公开模型',
      inputUnit: 'CHARACTER',
      outputUnit: 'CHARACTER',
      contextWindow: 8192,
      status: 'AVAILABLE',
    };
    const apiCall: ApiCallLogDto = {
      id: 'call_1',
      requestId: 'req_1',
      apiKeyLabel: 'sk-gw-****9A2F',
      modelId: model.id,
      modelName: model.name,
      inputCharacters: 12,
      outputCharacters: 24,
      chargedUnits: 36,
      httpStatus: 200,
      durationMs: 300,
      createdAt: '2026-06-11T00:00:00.000Z',
    };

    const serialized = JSON.stringify({ model, apiCall });

    expect(serialized).not.toMatch(
      /passwordHash|apiKeyHash|keyHash|upstreamApiKey|upstreamKey|fullPrompt|fullResponse/,
    );
    expect(serialized).not.toContain('"prompt"');
    expect(serialized).not.toContain('"response"');
  });
});

void (0 as unknown as PublicDtosDoNotExposeSensitiveFields);
