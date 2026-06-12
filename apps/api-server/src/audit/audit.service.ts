import { createHmac } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../common/config/env.schema.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

const MAX_SUMMARY_DEPTH = 12;
const MAX_SUMMARY_STRING_LENGTH = 1024;
const MAX_SUMMARY_COLLECTION_ITEMS = 50;
const MAX_SUMMARY_JSON_BYTES = 16 * 1024;
const TRUNCATED = '[TRUNCATED]';

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

export interface AuditedTransactionContext {
  transaction: Prisma.TransactionClient;
  setBeforeSummary(value: unknown): void;
  setAfterSummary(value: unknown): void;
}

@Injectable()
export class AuditService {
  private readonly ipHashKey: string;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService<EnvironmentVariables, true>,
  ) {
    this.ipHashKey = configService.get('AUDIT_IP_HASH_SECRET', {
      infer: true,
    });
  }

  /**
   * Writes an audit observation without a business mutation transaction.
   * Sensitive writes must use runInAuditedTransaction.
   */
  async record(input: AuditRecordInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: this.buildAuditData(input),
    });
  }

  /**
   * Runs a sensitive business mutation and its audit insert in one Prisma
   * transaction. Any mutation, audit construction, or audit insert failure
   * rolls back the transaction. Every database read and write in the callback
   * must use context.transaction; injecting PrismaService into the caller
   * would bypass this guarantee.
   */
  runInAuditedTransaction<TResult>(
    auditInput: AuditRecordInput,
    mutation: (context: AuditedTransactionContext) => Promise<TResult>,
  ): Promise<TResult> {
    return this.prisma.$transaction(async (transaction) => {
      let beforeSummary = auditInput.beforeSummary;
      let afterSummary = auditInput.afterSummary;
      const result = await mutation({
        transaction,
        setBeforeSummary: (value) => {
          beforeSummary = value;
        },
        setAfterSummary: (value) => {
          afterSummary = value;
        },
      });

      await transaction.auditLog.create({
        data: this.buildAuditData({
          ...auditInput,
          beforeSummary,
          afterSummary,
        }),
      });

      return result;
    });
  }

  private buildAuditData(
    input: AuditRecordInput,
  ): Prisma.AuditLogUncheckedCreateInput {
    return {
      adminUserId: input.adminUserId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      requestId: input.requestId,
      beforeSummary:
        input.beforeSummary === undefined
          ? undefined
          : this.sanitizeSummary(input.beforeSummary),
      afterSummary:
        input.afterSummary === undefined
          ? undefined
          : this.sanitizeSummary(input.afterSummary),
      ipHash: input.ip ? this.hashIp(input.ip) : undefined,
    };
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
      return TRUNCATED;
    }

    if (
      value === null ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }

    if (typeof value === 'string') {
      if (value.length <= MAX_SUMMARY_STRING_LENGTH) {
        return value;
      }
      return `${value.slice(
        0,
        MAX_SUMMARY_STRING_LENGTH - TRUNCATED.length,
      )}${TRUNCATED}`;
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
      const items = value
        .slice(0, MAX_SUMMARY_COLLECTION_ITEMS - 1)
        .map((item) => this.sanitize(item, depth + 1, seen));
      if (value.length > MAX_SUMMARY_COLLECTION_ITEMS - 1) {
        items.push(TRUNCATED);
      }
      return items;
    }

    const safeEntries = Object.entries(value).filter(
      ([key]) => !this.isSensitiveKey(key),
    );
    const entries = safeEntries
      .slice(0, MAX_SUMMARY_COLLECTION_ITEMS - 1)
      .map(([key, item]) => [
        key,
        this.sanitize(item, depth + 1, seen),
      ]);
    if (safeEntries.length > MAX_SUMMARY_COLLECTION_ITEMS - 1) {
      entries.push(['__truncated__', true]);
    }

    return Object.fromEntries(entries);
  }

  private sanitizeSummary(value: unknown): Prisma.InputJsonValue {
    const sanitized = this.sanitize(value) as Prisma.InputJsonValue;
    const serialized = JSON.stringify(sanitized);
    if (
      serialized !== undefined &&
      Buffer.byteLength(serialized, 'utf8') <= MAX_SUMMARY_JSON_BYTES
    ) {
      return sanitized;
    }

    return { __truncated__: true };
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
