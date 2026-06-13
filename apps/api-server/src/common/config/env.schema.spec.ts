import { validateEnv } from './env.schema.js';

const validEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://gateway:gateway_local@127.0.0.1:5432/gateway',
  REDIS_URL: 'redis://127.0.0.1:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  API_KEY_PEPPER: 'b'.repeat(32),
  AUDIT_IP_HASH_SECRET: 'c'.repeat(32),
  ADMIN_LOGIN_THROTTLE_SECRET: 'd'.repeat(32),
  UPSTREAM_BASE_URL: 'http://127.0.0.1:4010/v1',
  PAYMENT_DRIVER: 'test',
};

function getValidationError(config: Record<string, unknown>): Error {
  try {
    validateEnv(config);
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
  }

  throw new Error('Expected environment validation to fail');
}

describe('validateEnv', () => {
  it('rejects a missing NODE_ENV', () => {
    const envWithoutNodeEnv: Record<string, unknown> = { ...validEnv };
    delete envWithoutNodeEnv.NODE_ENV;

    expect(() => validateEnv(envWithoutNodeEnv)).toThrow(
      'Invalid environment configuration: NODE_ENV',
    );
  });

  it('rejects short secrets', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        JWT_ACCESS_SECRET: 'short',
        API_KEY_PEPPER: 'short',
        AUDIT_IP_HASH_SECRET: 'short',
        ADMIN_LOGIN_THROTTLE_SECRET: 'short',
      }),
    ).toThrow();
  });

  it.each([
    ['DATABASE_URL', 'https://database.example.com'],
    ['REDIS_URL', 'https://cache.example.com'],
    ['UPSTREAM_BASE_URL', 'ftp://upstream.example.com'],
  ])('rejects an invalid %s', (key, value) => {
    expect(getValidationError({ ...validEnv, [key]: value }).message).toBe(
      `Invalid environment configuration: ${key}`,
    );
  });

  it('accepts only the supported URL schemes', () => {
    expect(
      validateEnv({
        ...validEnv,
        DATABASE_URL: 'postgres://gateway:local@127.0.0.1:5432/gateway',
        REDIS_URL: 'rediss://cache.example.com:6380',
        UPSTREAM_BASE_URL: 'https://upstream.example.com/v1',
      }),
    ).toMatchObject({
      DATABASE_URL: 'postgres://gateway:local@127.0.0.1:5432/gateway',
      REDIS_URL: 'rediss://cache.example.com:6380',
      UPSTREAM_BASE_URL: 'https://upstream.example.com/v1',
    });
  });

  it('trims secrets before enforcing the minimum length', () => {
    const validated = validateEnv({
      ...validEnv,
      JWT_ACCESS_SECRET: `  ${'a'.repeat(32)}  `,
      API_KEY_PEPPER: `  ${'b'.repeat(32)}  `,
      AUDIT_IP_HASH_SECRET: `  ${'c'.repeat(32)}  `,
      ADMIN_LOGIN_THROTTLE_SECRET: `  ${'d'.repeat(32)}  `,
    });

    expect(validated.JWT_ACCESS_SECRET).toBe('a'.repeat(32));
    expect(validated.API_KEY_PEPPER).toBe('b'.repeat(32));
    expect(validated.AUDIT_IP_HASH_SECRET).toBe('c'.repeat(32));
    expect(validated.ADMIN_LOGIN_THROTTLE_SECRET).toBe('d'.repeat(32));
  });

  it('rejects whitespace-only secrets', () => {
    const error = getValidationError({
      ...validEnv,
      JWT_ACCESS_SECRET: ' '.repeat(64),
      API_KEY_PEPPER: '\t'.repeat(64),
      AUDIT_IP_HASH_SECRET: '\n'.repeat(64),
      ADMIN_LOGIN_THROTTLE_SECRET: ' '.repeat(64),
    });

    expect(error.message).toBe(
      'Invalid environment configuration: JWT_ACCESS_SECRET, API_KEY_PEPPER, AUDIT_IP_HASH_SECRET, ADMIN_LOGIN_THROTTLE_SECRET',
    );
  });

  it('summarizes invalid fields without leaking their values', () => {
    const privateDatabaseValue = 'https://private-database.example.com/secret';
    const privateRedisValue = 'https://private-cache.example.com/secret';
    const error = getValidationError({
      ...validEnv,
      DATABASE_URL: privateDatabaseValue,
      REDIS_URL: privateRedisValue,
      JWT_ACCESS_SECRET: 'private-short-secret',
    });

    expect(error.message).toBe(
      'Invalid environment configuration: DATABASE_URL, REDIS_URL, JWT_ACCESS_SECRET',
    );
    expect(error.message).not.toContain(privateDatabaseValue);
    expect(error.message).not.toContain(privateRedisValue);
    expect(error.message).not.toContain('private-short-secret');
  });

  it('rejects unsupported payment drivers', () => {
    expect(() =>
      validateEnv({ ...validEnv, PAYMENT_DRIVER: 'unsupported' }),
    ).toThrow();
  });

  it.each([undefined, '', '   '])(
    'defaults TRUST_PROXY_CIDRS=%p to an empty list',
    (value) => {
      expect(
        validateEnv({
          ...validEnv,
          ...(value === undefined ? {} : { TRUST_PROXY_CIDRS: value }),
        }),
      ).toMatchObject({ TRUST_PROXY_CIDRS: [] });
    },
  );

  it('accepts loopback and valid IPv4/IPv6 CIDRs', () => {
    expect(
      validateEnv({
        ...validEnv,
        TRUST_PROXY_CIDRS:
          ' loopback, 10.0.0.0/8, 2001:db8::/32 ',
      }),
    ).toMatchObject({
      TRUST_PROXY_CIDRS: [
        'loopback',
        '10.0.0.0/8',
        '2001:db8::/32',
      ],
    });
  });

  it.each([
    '203.0.113.42',
    '203.0.113.0/33',
    '2001:db8::/129',
    'linklocal',
    'loopback, private-invalid-proxy',
  ])('rejects invalid TRUST_PROXY_CIDRS without leaking %p', (value) => {
    const error = getValidationError({
      ...validEnv,
      TRUST_PROXY_CIDRS: value,
    });

    expect(error.message).toBe(
      'Invalid environment configuration: TRUST_PROXY_CIDRS',
    );
    expect(error.message).not.toContain(value);
  });

  it('defaults gateway rate limits', () => {
    expect(validateEnv(validEnv)).toMatchObject({
      GATEWAY_IP_RATE_LIMIT_PER_MINUTE: 120,
      GATEWAY_USER_RATE_LIMIT_PER_MINUTE: 60,
      GATEWAY_KEY_RATE_LIMIT_PER_MINUTE: 60,
      WECHAT_LOGIN_RATE_LIMIT_PER_MINUTE: 30,
      WECHAT_TEST_LOGIN_ENABLED: false,
    });
  });

  it.each([
    ['GATEWAY_IP_RATE_LIMIT_PER_MINUTE', 0],
    ['GATEWAY_USER_RATE_LIMIT_PER_MINUTE', -1],
    ['GATEWAY_KEY_RATE_LIMIT_PER_MINUTE', 1.5],
  ])('rejects invalid %s', (key, value) => {
    expect(() =>
      validateEnv({ ...validEnv, [key]: value }),
    ).toThrow(String(key));
  });

  it('rejects the test payment driver in production', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        NODE_ENV: 'production',
        PAYMENT_DRIVER: 'test',
      }),
    ).toThrow();
  });

  it('accepts the WeChat payment driver in production', () => {
    expect(
      validateEnv({
        ...validEnv,
        NODE_ENV: 'production',
        PAYMENT_DRIVER: 'wechat',
        WECHAT_APP_ID: 'production-placeholder-app-id',
        WECHAT_APP_SECRET: 'production-placeholder-app-secret',
      }),
    ).toMatchObject({
      NODE_ENV: 'production',
      PAYMENT_DRIVER: 'wechat',
    });
  });

  it('rejects missing WeChat login credentials in production', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        NODE_ENV: 'production',
        PAYMENT_DRIVER: 'wechat',
      }),
    ).toThrow(
      'Invalid environment configuration: WECHAT_APP_ID, WECHAT_APP_SECRET',
    );
  });

  it('rejects whitespace-only WeChat login credentials in production', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        NODE_ENV: 'production',
        PAYMENT_DRIVER: 'wechat',
        WECHAT_APP_ID: '   ',
        WECHAT_APP_SECRET: '\t',
      }),
    ).toThrow(
      'Invalid environment configuration: WECHAT_APP_ID, WECHAT_APP_SECRET',
    );
  });

  it('allows omitted WeChat login credentials outside production', () => {
    expect(validateEnv(validEnv)).toMatchObject({
      NODE_ENV: 'development',
    });
  });

  it('allows explicitly enabling test login in development', () => {
    expect(
      validateEnv({
        ...validEnv,
        WECHAT_TEST_LOGIN_ENABLED: 'true',
      }),
    ).toMatchObject({
      NODE_ENV: 'development',
      WECHAT_TEST_LOGIN_ENABLED: true,
    });
  });

  it('rejects enabling test login in production', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        NODE_ENV: 'production',
        PAYMENT_DRIVER: 'wechat',
        WECHAT_APP_ID: 'production-placeholder-app-id',
        WECHAT_APP_SECRET: 'production-placeholder-app-secret',
        WECHAT_TEST_LOGIN_ENABLED: true,
      }),
    ).toThrow(
      'Invalid environment configuration: WECHAT_TEST_LOGIN_ENABLED',
    );
  });

  it.each([0, 1001, 1.5])(
    'rejects WECHAT_LOGIN_RATE_LIMIT_PER_MINUTE=%s',
    (value) => {
      expect(() =>
        validateEnv({
          ...validEnv,
          WECHAT_LOGIN_RATE_LIMIT_PER_MINUTE: value,
        }),
      ).toThrow('WECHAT_LOGIN_RATE_LIMIT_PER_MINUTE');
    },
  );
});
