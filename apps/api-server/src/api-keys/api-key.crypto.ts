import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const SECRET_BYTES = 32;
const SECRET_LENGTH = 43;
const HASH_BYTES = 32;

export interface ApiKeyMaterial {
  plaintext: string;
  prefix: string;
  lastFour: string;
  secretHash: string;
}

export interface ParsedApiKey {
  keyId: string;
}

export function createApiKeyMaterial(
  keyId: string,
  pepper: string,
  randomSource: (size: number) => Buffer = randomBytes,
): ApiKeyMaterial {
  const secret = randomSource(SECRET_BYTES).toString('base64url');
  const prefix = `sk-gw_${keyId}`;
  const plaintext = `${prefix}_${secret}`;

  return {
    plaintext,
    prefix,
    lastFour: secret.slice(-4),
    secretHash: hashApiKey(pepper, plaintext),
  };
}

export function hashApiKey(
  pepper: string,
  plaintext: string,
): string {
  return createHmac('sha256', pepper)
    .update(`platform-api-key:v1:${plaintext}`)
    .digest('hex');
}

export function verifyApiKeyHash(
  pepper: string,
  plaintext: string,
  expectedHash: string,
): boolean {
  const actual = Buffer.from(hashApiKey(pepper, plaintext), 'hex');
  const validExpected = /^[a-f0-9]{64}$/i.test(expectedHash);
  const expected = validExpected
    ? Buffer.from(expectedHash, 'hex')
    : Buffer.alloc(HASH_BYTES);
  const matches = timingSafeEqual(actual, expected);
  return validExpected && matches;
}

export function parseApiKey(
  plaintext: string,
): ParsedApiKey | undefined {
  const match = new RegExp(
    `^sk-gw_([A-Za-z0-9_-]{1,100})_([A-Za-z0-9_-]{${SECRET_LENGTH}})$`,
  ).exec(plaintext);
  if (!match) {
    return undefined;
  }
  return { keyId: match[1]! };
}
