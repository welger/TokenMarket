import { randomUUID } from 'node:crypto';

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { mergeMap, Observable } from 'rxjs';

import {
  AUDITED_ACTION_METADATA,
  type AuditedActionContext,
  type AuditedActionOptions,
  type AuditRequest,
} from './audited-action.decorator.js';
import { AuditService } from './audit.service.js';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // This interceptor observes a completed handler. Database mutations that
    // require atomic audit logging must use AuditService.executeAuditedMutation.
    const options = this.reflector.getAllAndOverride<AuditedActionOptions>(
      AUDITED_ACTION_METADATA,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AuditRequest>();
    if (!request.user || request.user.type !== 'admin') {
      throw new UnauthorizedException();
    }

    return next.handle().pipe(
      mergeMap(async (result: unknown) => {
        const selectorContext: AuditedActionContext = { request, result };

        await this.auditService.record({
          adminUserId: request.user!.sub,
          action: options.action,
          resourceType: options.resourceType,
          resourceId: this.asOptionalString(
            this.resolve(options.resourceId, selectorContext),
          ),
          requestId: this.getRequestId(request),
          beforeSummary: this.resolve(
            options.beforeSummary,
            selectorContext,
          ),
          afterSummary: this.resolve(options.afterSummary, selectorContext),
          ip: request.ip ?? request.socket?.remoteAddress,
        });

        return result;
      }),
    );
  }

  private resolve(
    selector: AuditedActionOptions['resourceId'],
    context: AuditedActionContext,
  ): unknown {
    if (typeof selector === 'function') {
      return selector(context);
    }

    return selector;
  }

  private asOptionalString(value: unknown): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    return String(value);
  }

  private getRequestId(request: AuditRequest): string {
    const requestId = request.headers?.['x-request-id'];
    if (typeof requestId === 'string' && requestId.length > 0) {
      return requestId;
    }
    if (Array.isArray(requestId) && requestId[0]) {
      return requestId[0];
    }

    return randomUUID();
  }
}
