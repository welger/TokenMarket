import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';

import { ContentPolicyService } from './content-policy.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';

function createHarness(rules: Array<Record<string, unknown>>) {
  const findMany = jest.fn().mockResolvedValue(rules);
  const create = jest.fn().mockResolvedValue({ id: 'event_1' });
  const prisma = {
    contentPolicyRule: { findMany },
    contentPolicyEvent: { create },
  } as unknown as PrismaService;
  return {
    service: new ContentPolicyService(prisma, {} as AuditService),
    create,
  };
}

describe('ContentPolicyService', () => {
  it('rejects an empty rule update', () => {
    const service = new ContentPolicyService(
      {} as PrismaService,
      {} as AuditService,
    );

    expect(() => service.updateRule('admin_1', 'rule_1', {})).toThrow(
      'At least one content policy field is required',
    );
  });

  it('returns matched metadata without echoing private input', async () => {
    const harness = createHarness([
      {
        id: 'rule_1',
        enabled: true,
        category: 'FRAUD',
        matchType: 'KEYWORD',
        pattern: '测试禁词',
        action: 'BLOCK',
      },
    ]);
    const privateInput = '包含测试禁词的私人正文';

    const result = await harness.service.inspect(
      privateInput,
      'req-policy-1',
    );

    expect(result).toEqual({
      allowed: false,
      ruleId: 'rule_1',
      category: 'FRAUD',
      action: 'BLOCK',
    });
    expect(JSON.stringify(result)).not.toContain(privateInput);
    expect(harness.create).toHaveBeenCalledWith({
      data: {
        ruleId: 'rule_1',
        category: 'FRAUD',
        action: 'BLOCK',
        requestId: 'req-policy-1',
      },
    });
    expect(JSON.stringify(harness.create.mock.calls)).not.toContain(
      privateInput,
    );
  });

  it('supports conservative regular-expression rules', async () => {
    const harness = createHarness([
      {
        id: 'rule_2',
        enabled: true,
        category: 'ATTACK',
        matchType: 'REGEX',
        pattern: 'drop\\s+table',
        action: 'BLOCK',
      },
    ]);

    await expect(
      harness.service.inspect('DROP   TABLE users', 'req-policy-2'),
    ).resolves.toMatchObject({
      allowed: false,
      ruleId: 'rule_2',
      category: 'ATTACK',
    });
  });

  it('allows content when no enabled rule matches', async () => {
    const harness = createHarness([]);

    await expect(
      harness.service.inspect('普通开发问题', 'req-policy-3'),
    ).resolves.toEqual({ allowed: true });
    expect(harness.create).not.toHaveBeenCalled();
  });

  it('rejects changing an existing unsafe pattern into a regex rule', async () => {
    const before = {
      id: 'rule_3',
      name: 'legacy keyword',
      enabled: true,
      category: 'ATTACK',
      matchType: 'KEYWORD',
      pattern: '(a+)+',
      action: 'BLOCK',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const transaction = {
      contentPolicyRule: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(before),
        update: jest.fn(),
      },
    };
    const audit = {
      runInAuditedTransaction: jest.fn(
        async (
          _input: unknown,
          operation: (context: {
            transaction: typeof transaction;
            setBeforeSummary(value: unknown): void;
            setAfterSummary(value: unknown): void;
          }) => Promise<unknown>,
        ) =>
          operation({
            transaction,
            setBeforeSummary: () => undefined,
            setAfterSummary: () => undefined,
          }),
      ),
    } as unknown as AuditService;
    const service = new ContentPolicyService(
      {} as PrismaService,
      audit,
    );

    await expect(
      service.updateRule('admin_1', 'rule_3', {
        matchType: 'REGEX',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.contentPolicyRule.update).not.toHaveBeenCalled();
  });
});
