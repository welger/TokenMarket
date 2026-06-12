import type {
  CallHandler,
  ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { jest } from '@jest/globals';
import { lastValueFrom, of } from 'rxjs';

import { AUDITED_ACTION_METADATA } from './audited-action.decorator.js';
import { AuditInterceptor } from './audit.interceptor.js';
import type { AuditService } from './audit.service.js';

describe('AuditInterceptor', () => {
  it('propagates an observation audit failure after a handler completes', async () => {
    const handler = () => undefined;
    Reflect.defineMetadata(
      AUDITED_ACTION_METADATA,
      {
        action: 'MODEL_DISABLED',
        resourceType: 'model',
      },
      handler,
    );
    const auditFailure = new Error('audit unavailable');
    const auditService = {
      record: jest.fn().mockRejectedValue(auditFailure),
    } as unknown as AuditService;
    const interceptor = new AuditInterceptor(
      new Reflector(),
      auditService,
    );
    const context = {
      getHandler: () => handler,
      getClass: () => class TestController {},
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { 'x-request-id': 'req_1' },
          user: { sub: 'admin_1', role: 'OWNER', type: 'admin' },
          body: {},
          params: {},
          ip: '127.0.0.1',
        }),
      }),
    } as unknown as ExecutionContext;
    const next = {
      handle: () => of({ changed: true }),
    } as CallHandler;

    await expect(
      lastValueFrom(interceptor.intercept(context, next)),
    ).rejects.toBe(auditFailure);
  });
});
