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
import type { EnvironmentVariables } from '../common/config/env.schema.js';

@Module({
  imports: [
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
  controllers: [AdminAuthController],
  providers: [
    AdminAuthService,
    AdminLoginThrottleService,
    PasswordHasher,
    AdminJwtGuard,
    UserJwtGuard,
    RolesGuard,
  ],
  exports: [
    AdminAuthService,
    AdminLoginThrottleService,
    AdminJwtGuard,
    UserJwtGuard,
    RolesGuard,
    JwtModule,
  ],
})
export class AuthModule {}
