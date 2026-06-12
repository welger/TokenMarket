import Joi from 'joi';

export type NodeEnvironment = 'development' | 'test' | 'production';
export type PaymentDriver = 'test' | 'wechat';

export interface EnvironmentVariables {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  DATABASE_URL: string;
  REDIS_URL: string;
  JWT_ACCESS_SECRET: string;
  API_KEY_PEPPER: string;
  AUDIT_IP_HASH_SECRET: string;
  ADMIN_LOGIN_THROTTLE_SECRET: string;
  TRUST_PROXY_HOPS: number;
  UPSTREAM_BASE_URL: string;
  UPSTREAM_API_KEY?: string;
  UPSTREAM_DEFAULT_MODEL: string;
  PAYMENT_DRIVER: PaymentDriver;
}

const envSchema = Joi.object<EnvironmentVariables>({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).required(),
  JWT_ACCESS_SECRET: Joi.string().trim().min(32).required(),
  API_KEY_PEPPER: Joi.string().trim().min(32).required(),
  AUDIT_IP_HASH_SECRET: Joi.string().trim().min(32).required(),
  ADMIN_LOGIN_THROTTLE_SECRET: Joi.string().trim().min(32).required(),
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).max(5).default(0),
  UPSTREAM_BASE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required(),
  UPSTREAM_API_KEY: Joi.string().optional(),
  UPSTREAM_DEFAULT_MODEL: Joi.string().min(1).default('test-model'),
  PAYMENT_DRIVER: Joi.string()
    .valid('test', 'wechat')
    .default('test'),
}).unknown(true);

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const { error, value } = envSchema.validate(config, {
    abortEarly: false,
    convert: true,
  });

  if (error) {
    const fields = [
      ...new Set(error.details.map((detail) => detail.path.join('.'))),
    ].join(', ');
    throw new Error(`Invalid environment configuration: ${fields}`);
  }

  if (value.NODE_ENV === 'production' && value.PAYMENT_DRIVER === 'test') {
    throw new Error('Invalid environment configuration: PAYMENT_DRIVER');
  }

  return value;
}
