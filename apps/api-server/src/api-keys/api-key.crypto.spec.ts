import {
  createApiKeyMaterial,
  parseApiKey,
  verifyApiKeyHash,
} from './api-key.crypto.js';

const pepper = 'local-test-pepper-that-is-at-least-32-bytes';

describe('API key cryptography', () => {
  it('creates the documented format without storing the plaintext parts separately', () => {
    const material = createApiKeyMaterial(
      'key_1',
      pepper,
      () => Buffer.alloc(32, 7),
    );

    expect(material.plaintext).toMatch(
      /^sk-gw_key_1_[A-Za-z0-9_-]{43}$/,
    );
    expect(material.prefix).toBe('sk-gw_key_1');
    expect(material.lastFour).toHaveLength(4);
    expect(material.secretHash).toMatch(/^[a-f0-9]{64}$/);
    expect(parseApiKey(material.plaintext)).toEqual({
      keyId: 'key_1',
    });
  });

  it('verifies the HMAC with a constant-time comparison', () => {
    const material = createApiKeyMaterial(
      'key_1',
      pepper,
      () => Buffer.alloc(32, 9),
    );

    expect(
      verifyApiKeyHash(
        pepper,
        material.plaintext,
        material.secretHash,
      ),
    ).toBe(true);
    expect(
      verifyApiKeyHash(
        pepper,
        `${material.plaintext}x`,
        material.secretHash,
      ),
    ).toBe(false);
    expect(
      verifyApiKeyHash(pepper, material.plaintext, 'invalid-hash'),
    ).toBe(false);
  });

  it('rejects malformed or ambiguous keys', () => {
    expect(parseApiKey('sk-gw_key_1_short')).toBeUndefined();
    expect(parseApiKey('Bearer sk-gw_key_1_secret')).toBeUndefined();
    expect(parseApiKey('')).toBeUndefined();
  });
});
