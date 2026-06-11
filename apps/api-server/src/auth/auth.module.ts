import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { AdminAuthController } from './admin-auth.controller.js';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminJwtGuard } from './admin-jwt.guard.js';
import { RolesGuard } from './roles.guard.js';
import type { EnvironmentVariables } from '../common/config/env.schema.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (
        configService: ConfigService<EnvironmentVariables, true>,
      ) => ({
        secret: configService.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: { expiresIn: 15 * 60 },
      }),
    }),
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminJwtGuard, RolesGuard],
  exports: [AdminAuthService, AdminJwtGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
