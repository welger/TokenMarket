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

const errorCases = [
  [ErrorCode.UNAUTHORIZED, '未授权访问'],
  [ErrorCode.API_KEY_DISABLED, 'API Key 已停用'],
  [ErrorCode.QUOTA_EXHAUSTED, '套餐额度不足'],
  [ErrorCode.MODEL_UNAVAILABLE, '模型暂不可用'],
  [ErrorCode.RATE_LIMITED, '请求过于频繁'],
  [ErrorCode.CONTENT_REJECTED, '请求违反内容安全规则'],
  [ErrorCode.UPSTREAM_TIMEOUT, '上游模型响应超时'],
  [ErrorCode.INTERNAL_ERROR, '服务暂时不可用'],
] as const;

describe('public error contract', () => {
  it.each(errorCases)(
    'returns a stable public error shape for %s',
    (code, message) => {
      expect(errorResponse(code, 'req_1')).toEqual({
        error: {
          code,
          message,
          requestId: 'req_1',
        },
      });
    },
  );

  it('exposes only the fixed public error codes', () => {
    const actualCodes = Object.values(ErrorCode);
    const expectedCodes = errorCases.map(([code]) => code);

    expect(new Set(actualCodes)).toEqual(new Set(expectedCodes));
    expect(actualCodes).toHaveLength(expectedCodes.length);
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
type RecursiveKeys<T> = T extends readonly (infer Item)[]
  ? RecursiveKeys<Item>
  : T extends object
    ? {
        [Key in keyof T]: Key | RecursiveKeys<T[Key]>;
      }[keyof T]
    : never;
type PublicDtosDoNotExposeSensitiveFields = AssertNever<
  Extract<RecursiveKeys<PublicDto>, SensitiveField>
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
