import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { AdminAuthController } from './admin-auth.controller.js';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminLoginThrottleService } from './admin-login-throttle.service.js';
import { AdminJwtGuard } from './admin-jwt.guard.js';
import { PasswordHasher } from './password-hasher.js';
import { RolesGuard } from './roles.guard.js';
import { UserJwtGuard } from './user-jwt.guard.js';
import { WechatAuthController } from './wechat-auth.controller.js';
import { WechatAuthService } from './wechat-auth.service.js';
import { WechatLoginThrottleService } from './wechat-login-throttle.service.js';
import {
  createWechatCodeExchange,
  WECHAT_CODE_EXCHANGE,
} from './wechat-code-exchange.js';
import type { EnvironmentVariables } from '../common/config/env.schema.js';
import { RiskModule } from '../risk/risk.module.js';

@Module({
  imports: [
    RiskModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (
        configService: ConfigService<EnvironmentVariables, true>,
      ) => ({
        secret: configService.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: {
          algorithm: 'HS256',
          issuer: 'multi-model-api-platform',
          audience: 'admin-console',
          expiresIn: 15 * 60,
        },
      }),
    }),
  ],
  controllers: [AdminAuthController, WechatAuthController],
  providers: [
    AdminAuthService,
    AdminLoginThrottleService,
    PasswordHasher,
    WechatAuthService,
    WechatLoginThrottleService,
    {
      provide: WECHAT_CODE_EXCHANGE,
      inject: [ConfigService],
      useFactory: (
        configService: ConfigService<EnvironmentVariables, true>,
      ) =>
        createWechatCodeExchange(
          configService.get('NODE_ENV', { infer: true }),
          configService.get('WECHAT_APP_ID', { infer: true }),
          configService.get('WECHAT_APP_SECRET', { infer: true }),
          configService.get('WECHAT_TEST_LOGIN_ENABLED', { infer: true }),
        ),
    },
    AdminJwtGuard,
    UserJwtGuard,
    RolesGuard,
  ],
  exports: [
    AdminAuthService,
    AdminLoginThrottleService,
    WechatAuthService,
    AdminJwtGuard,
    UserJwtGuard,
    RolesGuard,
    JwtModule,
  ],
})
export class AuthModule {}
