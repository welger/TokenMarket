import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import type {
  AdminAuthenticatedRequest,
  AdminJwtPayload,
} from './admin-auth.types.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AdminUserStatus } from '../generated/prisma/client.js';

type RequestWithHeaders = AdminAuthenticatedRequest & {
  headers?: Record<string, string | string[] | undefined>;
};

@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const token = this.extractBearerToken(request.headers?.authorization);

    if (!token) {
      throw new UnauthorizedException();
    }

    try {
      const payload = await this.jwtService.verifyAsync<AdminJwtPayload>(token);

      if (payload.type !== 'admin' || typeof payload.sub !== 'string') {
        throw new UnauthorizedException();
      }

      const admin = await this.prisma.adminUser.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, status: true },
      });

      if (!admin || admin.status !== AdminUserStatus.ACTIVE) {
        throw new UnauthorizedException();
      }

      request.user = {
        sub: admin.id,
        role: admin.role,
        type: 'admin',
        iat: payload.iat,
        exp: payload.exp,
      };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }

  private extractBearerToken(
    authorization: string | string[] | undefined,
  ): string | undefined {
    if (typeof authorization !== 'string') {
      return undefined;
    }

    const [scheme, token, extra] = authorization.trim().split(/\s+/);
    if (scheme !== 'Bearer' || !token || extra) {
      return undefined;
    }

    return token;
  }
}
