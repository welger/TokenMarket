import { http, type HttpClient } from './http';

interface ApiKeyResponse {
  createdAt?: unknown;
  disabledAt?: unknown;
  id?: unknown;
  masked?: unknown;
  name?: unknown;
  plaintext?: unknown;
  status?: unknown;
}

export interface ApiKeyListItem {
  canDisable: boolean;
  createdAtText: string;
  disabledAtText: string;
  id: string;
  masked: string;
  name: string;
  statusText: string;
}

export interface CreatedApiKey {
  item: ApiKeyListItem;
  plaintext: string;
}

export async function loadApiKeys(
  client: HttpClient = http,
): Promise<ApiKeyListItem[]> {
  const keys = await client.request<ApiKeyResponse[]>({
    url: '/me/api-keys',
  });
  return mapApiKeys(Array.isArray(keys) ? keys : []);
}

export async function createApiKey(
  name: string,
  client: HttpClient = http,
): Promise<CreatedApiKey> {
  const created = await client.request<ApiKeyResponse, { name: string }>({
    data: { name },
    method: 'POST',
    url: '/me/api-keys',
  });
  const plaintext =
    typeof created.plaintext === 'string' ? created.plaintext.trim() : '';
  if (!plaintext) {
    throw new Error('创建失败，请稍后重试');
  }

  return {
    item: mapApiKey(created),
    plaintext,
  };
}

export async function disableApiKey(
  id: string,
  client: HttpClient = http,
): Promise<ApiKeyListItem> {
  const disabled = await client.request<ApiKeyResponse>({
    method: 'POST',
    url: `/me/api-keys/${encodeURIComponent(id)}/disable`,
  });
  return mapApiKey(disabled);
}

export function mapApiKeys(keys: ApiKeyResponse[]): ApiKeyListItem[] {
  return keys.map(mapApiKey);
}

export function mapApiKey(key: ApiKeyResponse): ApiKeyListItem {
  const status = text(key.status, 'UNKNOWN');
  const disabledAtText = dateText(key.disabledAt);

  return {
    canDisable: status === 'ACTIVE',
    createdAtText: dateText(key.createdAt) || '创建时间待确认',
    disabledAtText,
    id: text(key.id, ''),
    masked: text(key.masked, 'sk-gw_****'),
    name: text(key.name, '未命名 Key'),
    statusText: status === 'ACTIVE' ? '启用中' : '已停用',
  };
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function dateText(value: unknown): string {
  if (typeof value !== 'string' && !(value instanceof Date)) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}
