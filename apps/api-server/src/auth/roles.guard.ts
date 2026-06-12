import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AdminAuthenticatedRequest } from './admin-auth.types.js';
import { ADMIN_ROLES_METADATA } from './roles.decorator.js';
import type { AdminRole } from '../generated/prisma/client.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<AdminAuthenticatedRequest>();
    const admin = request.user;

    if (!admin || admin.type !== 'admin') {
      throw new UnauthorizedException();
    }

    const requiredRoles = this.reflector.getAllAndOverride<AdminRole[]>(
      ADMIN_ROLES_METADATA,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    if (!requiredRoles.includes(admin.role)) {
      throw new ForbiddenException();
    }

    return true;
  }
}
