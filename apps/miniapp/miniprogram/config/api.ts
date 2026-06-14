export type MiniProgramEnvVersion =
  WechatMiniprogram.MiniProgram['envVersion'];

export interface ApiBaseUrls {
  develop: string;
  trial: string;
  release: string;
}

export type ApiAllowedHosts = Record<
  MiniProgramEnvVersion,
  string[]
>;

export const API_BASE_URL_ERROR_MESSAGE = '服务地址未配置';
export const DEVELOP_API_BASE_URL = 'http://127.0.0.1:3000';

export const API_BASE_URLS: ApiBaseUrls = {
  develop: DEVELOP_API_BASE_URL,
  trial: 'https://api-staging.yourtoken.work',
  // 上线前必须配置真实的 HTTPS 正式环境地址。
  release: '',
};

export const API_ALLOWED_HOSTS: ApiAllowedHosts = {
  develop: ['localhost', '127.0.0.1'],
  trial: ['api-staging.yourtoken.work'],
  // 上线前必须填写正式环境 API 的精确主机名。
  release: [],
};

interface ParsedApiBaseUrl {
  hostname: string;
  protocol: 'http' | 'https';
}

function parseApiBaseUrl(value: string): ParsedApiBaseUrl | undefined {
  if (/\s/.test(value)) {
    return undefined;
  }

  const match = /^(https?):\/\/([^/?#]+)(?:\/[^?#]*)?$/i.exec(value);
  if (!match) {
    return undefined;
  }

  const protocol = match[1].toLowerCase() as 'http' | 'https';
  const authority = match[2];
  if (authority.includes('@')) {
    return undefined;
  }

  const authorityMatch = /^([A-Za-z0-9.-]+)(?::([0-9]+))?$/.exec(
    authority,
  );
  if (!authorityMatch) {
    return undefined;
  }

  const hostname = authorityMatch[1].toLowerCase();
  const port = authorityMatch[2];
  if (port) {
    const numericPort = Number(port);
    if (numericPort < 1 || numericPort > 65_535) {
      return undefined;
    }
  }

  if (
    hostname.length > 253 ||
    hostname.startsWith('.') ||
    hostname.endsWith('.')
  ) {
    return undefined;
  }

  const labels = hostname.split('.');
  if (
    labels.some(
      (label) =>
        label.length === 0 ||
        label.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
    )
  ) {
    return undefined;
  }

  return { hostname, protocol };
}

function isIpLiteralHostname(hostname: string): boolean {
  return hostname
    .split('.')
    .every((label) => /^(?:[0-9]+|0x[0-9a-f]+)$/i.test(label));
}

function isSpecialUseHostname(hostname: string): boolean {
  return [
    '.home.arpa',
    '.internal',
    '.lan',
    '.local',
    '.localdomain',
    '.localhost',
  ].some(
    (suffix) =>
      hostname === suffix.slice(1) || hostname.endsWith(suffix),
  );
}

function validateApiBaseUrl(
  value: string,
  envVersion: MiniProgramEnvVersion,
  allowedHosts: readonly string[],
): string {
  const baseUrl = value.trim();
  const parsed = parseApiBaseUrl(baseUrl);
  if (!parsed) {
    throw new Error(API_BASE_URL_ERROR_MESSAGE);
  }

  const isLocalDevelopmentHost =
    parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (envVersion === 'develop' && isLocalDevelopmentHost) {
    return baseUrl;
  }

  const isPublicHttpsHost =
    parsed.protocol === 'https' &&
    parsed.hostname.includes('.') &&
    !isIpLiteralHostname(parsed.hostname) &&
    !isSpecialUseHostname(parsed.hostname) &&
    parsed.hostname !== 'localhost' &&
    !parsed.hostname.endsWith('.localhost');

  const isAllowedHost =
    envVersion === 'develop' ||
    allowedHosts.some(
      (hostname) => hostname.trim().toLowerCase() === parsed.hostname,
    );

  if (!isPublicHttpsHost || !isAllowedHost) {
    throw new Error(API_BASE_URL_ERROR_MESSAGE);
  }

  return baseUrl;
}

export function resolveApiBaseUrlOverride(value: string): string {
  const envVersion = wx.getAccountInfoSync().miniProgram.envVersion;
  return validateApiBaseUrl(
    value,
    envVersion,
    API_ALLOWED_HOSTS[envVersion],
  );
}

export function resolveApiBaseUrl(
  baseUrls: ApiBaseUrls = API_BASE_URLS,
  allowedHosts: ApiAllowedHosts = API_ALLOWED_HOSTS,
): string {
  const envVersion = wx.getAccountInfoSync().miniProgram.envVersion;
  const configuredBaseUrl = baseUrls[envVersion].trim();

  if (envVersion === 'develop') {
    return validateApiBaseUrl(
      configuredBaseUrl || DEVELOP_API_BASE_URL,
      envVersion,
      allowedHosts[envVersion],
    );
  }

  return validateApiBaseUrl(
    configuredBaseUrl,
    envVersion,
    allowedHosts[envVersion],
  );
}
