import { createHmac } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../common/config/env.schema.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';

const MAX_SUMMARY_DEPTH = 12;

export interface AuditRecordInput {
  adminUserId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  requestId?: string;
  beforeSummary?: unknown;
  afterSummary?: unknown;
  ip?: string;
}

@Injectable()
export class AuditService {
  private readonly ipHashKey: string;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService<EnvironmentVariables, true>,
  ) {
    this.ipHashKey = configService.get('API_KEY_PEPPER', { infer: true });
  }

  async record(input: AuditRecordInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        adminUserId: input.adminUserId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        requestId: input.requestId,
        beforeSummary:
          input.beforeSummary === undefined
            ? undefined
            : (this.sanitize(input.beforeSummary) as Prisma.InputJsonValue),
        afterSummary:
          input.afterSummary === undefined
            ? undefined
            : (this.sanitize(input.afterSummary) as Prisma.InputJsonValue),
        ipHash: input.ip ? this.hashIp(input.ip) : undefined,
      },
    });
  }

  private hashIp(ip: string): string {
    return createHmac('sha256', this.ipHashKey)
      .update(`admin-audit-ip:v1:${ip}`)
      .digest('hex');
  }

  private sanitize(
    value: unknown,
    depth = 0,
    seen = new WeakSet<object>(),
  ): unknown {
    if (depth > MAX_SUMMARY_DEPTH) {
      return '[TRUNCATED]';
    }

    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }

    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value !== 'object') {
      return String(value);
    }

    if (seen.has(value)) {
      return '[CIRCULAR]';
    }
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitize(item, depth + 1, seen));
    }

    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !this.isSensitiveKey(key))
        .map(([key, item]) => [
          key,
          this.sanitize(item, depth + 1, seen),
        ]),
    );
  }

  private isSensitiveKey(key: string): boolean {
    const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();

    return (
      normalized === 'key' ||
      normalized.endsWith('password') ||
      normalized.endsWith('passwordhash') ||
      normalized.endsWith('token') ||
      normalized.endsWith('authorization') ||
      normalized.endsWith('apikey') ||
      normalized.endsWith('secret') ||
      normalized.endsWith('key') ||
      normalized.endsWith('credential') ||
      normalized.endsWith('credentials') ||
      normalized.endsWith('cookie') ||
      normalized.endsWith('session')
    );
  }
}
