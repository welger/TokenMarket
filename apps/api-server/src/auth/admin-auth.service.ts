import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { AdminLoginThrottleService } from './admin-login-throttle.service.js';
import type { AdminJwtPayload } from './admin-auth.types.js';
import { PasswordHasher } from './password-hasher.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AdminUserStatus } from '../generated/prisma/client.js';

export interface AdminLoginResult {
  accessToken: string;
}

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly passwordHasher: PasswordHasher,
    private readonly throttle: AdminLoginThrottleService,
  ) {}

  hashPassword(password: string): Promise<string> {
    return this.passwordHasher.hash(password);
  }

  async login(
    username: unknown,
    password: unknown,
    ip: string,
  ): Promise<AdminLoginResult> {
    const normalizedUsername =
      typeof username === 'string' ? username.trim() : '';
    const validUsername =
      normalizedUsername.length >= 1 && normalizedUsername.length <= 100;
    const validPassword =
      typeof password === 'string' &&
      password.length >= 1 &&
      password.length <= 256;
    const throttleUsername =
      normalizedUsername.slice(0, 100) || '<invalid>';
    const lease = await this.throttle.beginAttempt(throttleUsername, ip);

    try {
      const admin = validUsername && validPassword
        ? await this.prisma.adminUser.findUnique({
            where: { username: normalizedUsername },
          })
        : null;
      const activeAdmin =
        admin?.status === AdminUserStatus.ACTIVE ? admin : null;
      const passwordHash =
        activeAdmin?.passwordHash ?? this.passwordHasher.dummyHash;
      const passwordToVerify =
        validUsername && validPassword ? password : '';

      let passwordMatches = false;
      try {
        passwordMatches = await this.passwordHasher.verify(
          passwordHash,
          passwordToVerify,
        );
      } catch {
        passwordMatches = false;
      }

      if (
        !validUsername ||
        !validPassword ||
        !activeAdmin ||
        !passwordMatches
      ) {
        await lease.recordFailure();
        throw new UnauthorizedException();
      }

      await lease.clearFailures();
      const payload: AdminJwtPayload = {
        sub: activeAdmin.id,
        role: activeAdmin.role,
        type: 'admin',
      };
      const accessToken = await this.jwtService.signAsync(payload);

      await this.prisma.adminUser.update({
        where: { id: activeAdmin.id },
        data: { lastLoginAt: new Date() },
      });

      return { accessToken };
    } finally {
      await lease.release();
    }
  }
}
