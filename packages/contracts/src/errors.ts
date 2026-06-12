export enum ErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  API_KEY_DISABLED = 'API_KEY_DISABLED',
  QUOTA_EXHAUSTED = 'QUOTA_EXHAUSTED',
  MODEL_UNAVAILABLE = 'MODEL_UNAVAILABLE',
  RATE_LIMITED = 'RATE_LIMITED',
  CONTENT_REJECTED = 'CONTENT_REJECTED',
  COMPLIANCE_PROFILE_INCOMPLETE = 'COMPLIANCE_PROFILE_INCOMPLETE',
  UPSTREAM_TIMEOUT = 'UPSTREAM_TIMEOUT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

const messages: Record<ErrorCode, string> = {
  [ErrorCode.UNAUTHORIZED]: '未授权访问',
  [ErrorCode.API_KEY_DISABLED]: 'API Key 已停用',
  [ErrorCode.QUOTA_EXHAUSTED]: '套餐额度不足',
  [ErrorCode.MODEL_UNAVAILABLE]: '模型暂不可用',
  [ErrorCode.RATE_LIMITED]: '请求过于频繁',
  [ErrorCode.CONTENT_REJECTED]: '请求违反内容安全规则',
  [ErrorCode.COMPLIANCE_PROFILE_INCOMPLETE]:
    '生产环境合规资料不完整',
  [ErrorCode.UPSTREAM_TIMEOUT]: '上游模型响应超时',
  [ErrorCode.INTERNAL_ERROR]: '服务暂时不可用',
};

export interface PublicError {
  code: ErrorCode;
  message: string;
  requestId: string;
}

export interface ErrorResponse {
  error: PublicError;
}

export function errorResponse(
  code: ErrorCode,
  requestId: string,
): ErrorResponse {
  return {
    error: {
      code,
      message: messages[code],
      requestId,
    },
  };
}
