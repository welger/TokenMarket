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
    ['DATABASE_URL', 'not-a-url'],
    ['REDIS_URL', 'not-a-url'],
    ['UPSTREAM_BASE_URL', 'not-a-url'],
  ])('rejects an invalid %s', (key, value) => {
    expect(() => validateEnv({ ...validEnv, [key]: value })).toThrow();
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
