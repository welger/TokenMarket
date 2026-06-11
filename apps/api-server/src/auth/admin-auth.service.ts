import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { argon2id, hash, verify } from 'argon2';

import type { AdminJwtPayload } from './admin-auth.types.js';
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
  ) {}

  hashPassword(password: string): Promise<string> {
    return hash(password, { type: argon2id });
  }

  async login(
    username: unknown,
    password: unknown,
  ): Promise<AdminLoginResult> {
    if (
      typeof username !== 'string' ||
      typeof password !== 'string' ||
      username.trim().length === 0 ||
      password.length === 0
    ) {
      throw new UnauthorizedException();
    }

    const admin = await this.prisma.adminUser.findUnique({
      where: { username: username.trim() },
    });

    if (!admin || admin.status !== AdminUserStatus.ACTIVE) {
      throw new UnauthorizedException();
    }

    let passwordMatches = false;
    try {
      passwordMatches = await verify(admin.passwordHash, password);
    } catch {
      passwordMatches = false;
    }

    if (!passwordMatches) {
      throw new UnauthorizedException();
    }

    const payload: AdminJwtPayload = {
      sub: admin.id,
      role: admin.role,
      type: 'admin',
    };
    const accessToken = await this.jwtService.signAsync(payload);

    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    return { accessToken };
  }
}
