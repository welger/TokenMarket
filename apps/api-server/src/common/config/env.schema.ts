import { isIP } from 'node:net';

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
  TRUST_PROXY_CIDRS: string[];
  GATEWAY_IP_RATE_LIMIT_PER_MINUTE: number;
  GATEWAY_USER_RATE_LIMIT_PER_MINUTE: number;
  GATEWAY_KEY_RATE_LIMIT_PER_MINUTE: number;
  UPSTREAM_BASE_URL: string;
  UPSTREAM_API_KEY?: string;
  UPSTREAM_DEFAULT_MODEL: string;
  PAYMENT_DRIVER: PaymentDriver;
  WECHAT_APP_ID?: string;
  WECHAT_APP_SECRET?: string;
  WECHAT_PAY_MCH_ID?: string;
  WECHAT_PAY_SERIAL_NO?: string;
  WECHAT_PAY_PRIVATE_KEY_PATH?: string;
  WECHAT_PAY_PLATFORM_CERT_PATH?: string;
  WECHAT_PAY_API_V3_KEY?: string;
  WECHAT_PAY_NOTIFY_URL?: string;
  WECHAT_TEST_LOGIN_ENABLED: boolean;
  WECHAT_LOGIN_RATE_LIMIT_PER_MINUTE: number;
}

const envSchema = Joi.object<EnvironmentVariables>({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .required(),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).required(),
  JWT_ACCESS_SECRET: Joi.string().trim().min(32).required(),
  API_KEY_PEPPER: Joi.string().trim().min(32).required(),
  AUDIT_IP_HASH_SECRET: Joi.string().trim().min(32).required(),
  ADMIN_LOGIN_THROTTLE_SECRET: Joi.string().trim().min(32).required(),
  TRUST_PROXY_CIDRS: Joi.any()
    .custom((rawValue: unknown, helpers) => {
      if (rawValue === undefined || rawValue === null) {
        return [];
      }
      if (typeof rawValue !== 'string') {
        return helpers.error('any.invalid');
      }

      const trimmedValue = rawValue.trim();
      if (trimmedValue.length === 0) {
        return [];
      }

      const entries = trimmedValue.split(',').map((entry) => entry.trim());
      if (
        entries.some(
          (entry) =>
            entry.length === 0 ||
            (entry !== 'loopback' && !isValidCidr(entry)),
        )
      ) {
        return helpers.error('any.invalid');
      }

      return entries;
    })
    .default([]),
  GATEWAY_IP_RATE_LIMIT_PER_MINUTE: Joi.number()
    .integer()
    .min(1)
    .max(1_000_000)
    .default(120),
  GATEWAY_USER_RATE_LIMIT_PER_MINUTE: Joi.number()
    .integer()
    .min(1)
    .max(1_000_000)
    .default(60),
  GATEWAY_KEY_RATE_LIMIT_PER_MINUTE: Joi.number()
    .integer()
    .min(1)
    .max(1_000_000)
    .default(60),
  UPSTREAM_BASE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required(),
  UPSTREAM_API_KEY: Joi.string().optional(),
  UPSTREAM_DEFAULT_MODEL: Joi.string().min(1).default('test-model'),
  PAYMENT_DRIVER: Joi.string()
    .valid('test', 'wechat')
    .default('test'),
  WECHAT_APP_ID: Joi.string().trim().empty('').optional(),
  WECHAT_APP_SECRET: Joi.string().trim().empty('').optional(),
  WECHAT_PAY_MCH_ID: Joi.string().trim().empty('').optional(),
  WECHAT_PAY_SERIAL_NO: Joi.string().trim().empty('').optional(),
  WECHAT_PAY_PRIVATE_KEY_PATH: Joi.string().trim().empty('').optional(),
  WECHAT_PAY_PLATFORM_CERT_PATH: Joi.string()
    .trim()
    .empty('')
    .optional(),
  WECHAT_PAY_API_V3_KEY: Joi.string().trim().empty('').optional(),
  WECHAT_PAY_NOTIFY_URL: Joi.string()
    .trim()
    .empty('')
    .uri({ scheme: ['https'] })
    .optional(),
  WECHAT_TEST_LOGIN_ENABLED: Joi.boolean().default(false),
  WECHAT_LOGIN_RATE_LIMIT_PER_MINUTE: Joi.number()
    .integer()
    .min(1)
    .max(1000)
    .default(30),
}).unknown(true);

function isValidCidr(value: string): boolean {
  const separatorIndex = value.lastIndexOf('/');
  if (
    separatorIndex <= 0 ||
    separatorIndex === value.length - 1 ||
    value.includes('%')
  ) {
    return false;
  }

  const address = value.slice(0, separatorIndex);
  const prefix = value.slice(separatorIndex + 1);
  if (!/^\d+$/.test(prefix)) {
    return false;
  }

  const addressFamily = isIP(address);
  const prefixLength = Number(prefix);
  return (
    (addressFamily === 4 && prefixLength <= 32) ||
    (addressFamily === 6 && prefixLength <= 128)
  );
}

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
  if (value.NODE_ENV === 'production') {
    if (value.WECHAT_TEST_LOGIN_ENABLED) {
      throw new Error(
        'Invalid environment configuration: WECHAT_TEST_LOGIN_ENABLED',
      );
    }
    const missingWechatFields = [
      ...(value.WECHAT_APP_ID ? [] : ['WECHAT_APP_ID']),
      ...(value.WECHAT_APP_SECRET ? [] : ['WECHAT_APP_SECRET']),
    ];
    if (missingWechatFields.length > 0) {
      throw new Error(
        `Invalid environment configuration: ${missingWechatFields.join(', ')}`,
      );
    }
  }

  return value;
}
