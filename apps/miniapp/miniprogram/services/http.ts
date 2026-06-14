import {
  DEVELOP_API_BASE_URL,
  resolveApiBaseUrl,
  resolveApiBaseUrlOverride,
} from '../config/api';

export const ACCESS_TOKEN_STORAGE_KEY = 'accessToken';
export const DEFAULT_BASE_URL = DEVELOP_API_BASE_URL;

const GENERIC_ERROR_MESSAGE = '请求失败，请稍后重试';
const LOGIN_ERROR_MESSAGE = '登录失败，请稍后重试';
const NETWORK_ERROR_MESSAGE = '网络连接失败，请稍后重试';
const MAX_PUBLIC_MESSAGE_LENGTH = 200;
const PUBLIC_CODE_MESSAGES: Readonly<Record<string, string>> = {
  RATE_LIMITED: '操作过于频繁，请稍后重试',
  RATE_LIMIT_UNAVAILABLE: '服务暂不可用，请稍后重试',
};

type HttpMethod = NonNullable<WechatMiniprogram.RequestOption['method']>;

export interface HttpRequestOptions<TData = unknown> {
  url: string;
  method?: HttpMethod;
  data?: TData;
  header?: Record<string, string>;
}

export interface HttpClient {
  request<TResponse = unknown, TData = unknown>(
    options: HttpRequestOptions<TData>,
  ): Promise<TResponse>;
}

export interface HttpClientOptions {
  baseUrl?: string;
}

interface RawResponse<T> {
  data: T;
  statusCode: number;
}

interface LoginResponse {
  accessToken?: unknown;
}

let requestSequence = 0;
const refreshPromises = new Map<string, Promise<void>>();

function createRequestId(): string {
  requestSequence += 1;
  return `miniapp-${Date.now().toString(36)}-${requestSequence.toString(36)}`;
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function readAccessToken(): string | undefined {
  const value = wx.getStorageSync(ACCESS_TOKEN_STORAGE_KEY);
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }

  return value.trim();
}

function clearAccessTokenIfCurrent(expectedAccessToken?: string): void {
  if (
    expectedAccessToken &&
    readAccessToken() === expectedAccessToken
  ) {
    wx.removeStorageSync(ACCESS_TOKEN_STORAGE_KEY);
  }
}

function publicMessage(data: unknown, fallback: string): string {
  if (typeof data !== 'object' || data === null) {
    return fallback;
  }

  const body = data as {
    code?: unknown;
    userMessage?: unknown;
  };
  const userMessage = body.userMessage;

  if (typeof userMessage === 'string') {
    const normalized = userMessage.trim();
    if (
      normalized.length > 0 &&
      normalized.length <= MAX_PUBLIC_MESSAGE_LENGTH
    ) {
      return normalized;
    }
  }

  if (
    typeof body.code === 'string' &&
    Object.prototype.hasOwnProperty.call(PUBLIC_CODE_MESSAGES, body.code)
  ) {
    return PUBLIC_CODE_MESSAGES[body.code];
  }

  return fallback;
}

function requestOnce<TResponse, TData>(
  baseUrl: string,
  options: HttpRequestOptions<TData>,
  accessToken?: string,
): Promise<RawResponse<TResponse>> {
  const header: Record<string, string> = {
    ...options.header,
    'x-request-id': createRequestId(),
  };

  if (accessToken) {
    header.Authorization = `Bearer ${accessToken}`;
  }

  return new Promise((resolve, reject) => {
    wx.request({
      data: options.data,
      fail: () => {
        reject(new Error(NETWORK_ERROR_MESSAGE));
      },
      header,
      method: options.method ?? 'GET',
      success: (response) => {
        resolve({
          data: response.data as TResponse,
          statusCode: response.statusCode,
        });
      },
      url: joinUrl(baseUrl, options.url),
    } as WechatMiniprogram.RequestOption);
  });
}

function login(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.login({
      fail: () => {
        reject(new Error(LOGIN_ERROR_MESSAGE));
      },
      success: (result) => {
        if (typeof result.code !== 'string' || result.code.length === 0) {
          reject(new Error(LOGIN_ERROR_MESSAGE));
          return;
        }

        resolve(resolveLoginCode(result.code));
      },
    });
  });
}

function resolveLoginCode(code: string): string {
  const accountInfo = wx.getAccountInfoSync();
  if (accountInfo.miniProgram.envVersion !== 'develop') {
    return code;
  }

  const appId = accountInfo.miniProgram.appId.trim();
  const testUserId = /^[A-Za-z0-9_-]{1,128}$/.test(appId)
    ? appId
    : 'local-miniapp';
  return `test:${testUserId}`;
}

async function refreshAccessToken(baseUrl: string): Promise<void> {
  const code = await login();
  const response = await requestOnce<LoginResponse, { code: string }>(
    baseUrl,
    {
      data: { code },
      method: 'POST',
      url: '/auth/wechat/login',
    },
  );

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(publicMessage(response.data, LOGIN_ERROR_MESSAGE));
  }

  const accessToken = response.data.accessToken;
  if (typeof accessToken !== 'string' || accessToken.trim().length === 0) {
    throw new Error(LOGIN_ERROR_MESSAGE);
  }

  wx.setStorageSync(ACCESS_TOKEN_STORAGE_KEY, accessToken.trim());
}

function unwrapResponse<T>(response: RawResponse<T>): T {
  if (response.statusCode >= 200 && response.statusCode < 300) {
    return response.data;
  }

  throw new Error(publicMessage(response.data, GENERIC_ERROR_MESSAGE));
}

export function createHttpClient(
  options: HttpClientOptions = {},
): HttpClient {
  function getBaseUrl(): string {
    if (options.baseUrl === undefined) {
      return resolveApiBaseUrl();
    }

    return resolveApiBaseUrlOverride(options.baseUrl);
  }

  function refreshOnce(baseUrl: string): Promise<void> {
    const existingRefresh = refreshPromises.get(baseUrl);
    if (existingRefresh) {
      return existingRefresh;
    }

    const refreshPromise = refreshAccessToken(baseUrl).finally(() => {
      if (refreshPromises.get(baseUrl) === refreshPromise) {
        refreshPromises.delete(baseUrl);
      }
    });
    refreshPromises.set(baseUrl, refreshPromise);

    return refreshPromise;
  }

  async function refreshForExpiredToken(
    baseUrl: string,
    expiredAccessToken?: string,
  ): Promise<void> {
    try {
      await refreshOnce(baseUrl);
    } catch (error) {
      clearAccessTokenIfCurrent(expiredAccessToken);
      throw error;
    }
  }

  return {
    async request<TResponse = unknown, TData = unknown>(
      requestOptions: HttpRequestOptions<TData>,
    ): Promise<TResponse> {
      const baseUrl = getBaseUrl();
      const initialAccessToken = readAccessToken();
      const firstResponse = await requestOnce<TResponse, TData>(
        baseUrl,
        requestOptions,
        initialAccessToken,
      );

      if (firstResponse.statusCode !== 401) {
        return unwrapResponse(firstResponse);
      }

      let retryAccessToken = readAccessToken();
      if (retryAccessToken === initialAccessToken) {
        await refreshForExpiredToken(baseUrl, initialAccessToken);
        retryAccessToken = readAccessToken();
      }

      const retryResponse = await requestOnce<TResponse, TData>(
        baseUrl,
        requestOptions,
        retryAccessToken,
      );

      if (retryResponse.statusCode === 401) {
        clearAccessTokenIfCurrent(retryAccessToken);
      }

      return unwrapResponse(retryResponse);
    },
  };
}

export const http = createHttpClient();
