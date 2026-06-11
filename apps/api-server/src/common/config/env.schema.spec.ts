import { validateEnv } from './env.schema.js';

const validEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://gateway:gateway_local@127.0.0.1:5432/gateway',
  REDIS_URL: 'redis://127.0.0.1:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  API_KEY_PEPPER: 'b'.repeat(32),
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
  it('rejects short secrets', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        JWT_ACCESS_SECRET: 'short',
        API_KEY_PEPPER: 'short',
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
    });

    expect(validated.JWT_ACCESS_SECRET).toBe('a'.repeat(32));
    expect(validated.API_KEY_PEPPER).toBe('b'.repeat(32));
  });

  it('rejects whitespace-only secrets', () => {
    const error = getValidationError({
      ...validEnv,
      JWT_ACCESS_SECRET: ' '.repeat(64),
      API_KEY_PEPPER: '\t'.repeat(64),
    });

    expect(error.message).toBe(
      'Invalid environment configuration: JWT_ACCESS_SECRET, API_KEY_PEPPER',
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
      }),
    ).toMatchObject({
      NODE_ENV: 'production',
      PAYMENT_DRIVER: 'wechat',
    });
  });
});
