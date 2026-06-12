import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import type {
  UserAuthenticatedRequest,
  UserJwtPayload,
} from './user-auth.types.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { UserStatus } from '../generated/prisma/client.js';

type RequestWithHeaders = UserAuthenticatedRequest & {
  headers?: Record<string, string | string[] | undefined>;
};

@Injectable()
export class UserJwtGuard implements CanActivate {
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
      const payload = await this.jwtService.verifyAsync<UserJwtPayload>(
        token,
        {
          algorithms: ['HS256'],
          issuer: 'multi-model-api-platform',
          audience: 'miniapp',
        },
      );
      if (payload.type !== 'user' || typeof payload.sub !== 'string') {
        throw new UnauthorizedException();
      }
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, status: true },
      });
      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException();
      }

      request.user = {
        sub: user.id,
        type: 'user',
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
