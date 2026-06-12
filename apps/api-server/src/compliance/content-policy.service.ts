import { BadRequestException, Injectable } from '@nestjs/common';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import {
  ContentPolicyAction,
  ContentPolicyMatchType,
  type ContentPolicyRule,
  type Prisma,
} from '../generated/prisma/client.js';

const ALLOWED_CATEGORIES = new Set([
  'ILLEGAL',
  'FRAUD',
  'ATTACK',
  'INFRINGEMENT',
  'ABUSE',
]);

export interface ContentPolicyRuleWriteInput {
  name?: unknown;
  enabled?: unknown;
  category?: unknown;
  matchType?: unknown;
  pattern?: unknown;
  action?: unknown;
}

export type ContentInspectionResult =
  | { allowed: true }
  | {
      allowed: false;
      ruleId: string;
      category: string;
      action: string;
    };

@Injectable()
export class ContentPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  listRules() {
    return this.prisma.contentPolicyRule.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  listPublicRules() {
    return this.prisma.contentPolicyRule.findMany({
      where: { enabled: true },
      select: {
        name: true,
        category: true,
        action: true,
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  createRule(
    adminUserId: string,
    input: ContentPolicyRuleWriteInput,
  ): Promise<ContentPolicyRule> {
    const data = this.parseRuleInput(
      input,
      true,
    ) as Prisma.ContentPolicyRuleUncheckedCreateInput;
    return this.auditService.runInAuditedTransaction(
      {
        adminUserId,
        action: 'CONTENT_POLICY_RULE_CREATED',
        resourceType: 'content_policy_rule',
      },
      async ({ transaction, setAfterSummary }) => {
        const created = await transaction.contentPolicyRule.create({ data });
        await this.disableProduction(transaction);
        setAfterSummary({
          id: created.id,
          category: created.category,
          enabled: created.enabled,
          action: created.action,
        });
        return created;
      },
    );
  }

  updateRule(
    adminUserId: string,
    id: string,
    input: ContentPolicyRuleWriteInput,
  ): Promise<ContentPolicyRule> {
    const data = this.parseRuleInput(
      input,
      false,
    ) as Prisma.ContentPolicyRuleUncheckedUpdateInput;
    return this.auditService.runInAuditedTransaction(
      {
        adminUserId,
        action: 'CONTENT_POLICY_RULE_UPDATED',
        resourceType: 'content_policy_rule',
        resourceId: id,
      },
      async ({
        transaction,
        setBeforeSummary,
        setAfterSummary,
      }) => {
        const before =
          await transaction.contentPolicyRule.findUniqueOrThrow({
            where: { id },
          });
        this.assertPatternIsSafe(
          (data.matchType as ContentPolicyMatchType | undefined) ??
            before.matchType,
          (data.pattern as string | undefined) ?? before.pattern,
        );
        const updated = await transaction.contentPolicyRule.update({
          where: { id },
          data,
        });
        await this.disableProduction(transaction);
        setBeforeSummary({
          category: before.category,
          enabled: before.enabled,
          action: before.action,
        });
        setAfterSummary({
          category: updated.category,
          enabled: updated.enabled,
          action: updated.action,
        });
        return updated;
      },
    );
  }

  async inspect(
    input: string,
    requestId: string,
  ): Promise<ContentInspectionResult> {
    const rules = await this.prisma.contentPolicyRule.findMany({
      where: { enabled: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const matched = rules.find((rule) => this.matches(rule, input));
    if (!matched) {
      return { allowed: true };
    }

    await this.prisma.contentPolicyEvent.create({
      data: {
        ruleId: matched.id,
        category: matched.category,
        action: matched.action,
        requestId,
      },
    });

    return {
      allowed: false,
      ruleId: matched.id,
      category: matched.category,
      action: matched.action,
    };
  }

  private parseRuleInput(
    input: ContentPolicyRuleWriteInput,
    requireAll: boolean,
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    for (const key of ['name', 'category', 'pattern'] as const) {
      const value = input[key];
      if (value === undefined && !requireAll) {
        continue;
      }
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new BadRequestException(`Invalid ${key}`);
      }
      data[key] = value.trim();
    }

    if (
      typeof data.category === 'string' &&
      !ALLOWED_CATEGORIES.has(data.category)
    ) {
      throw new BadRequestException('Invalid content policy category');
    }

    if (input.enabled !== undefined) {
      if (typeof input.enabled !== 'boolean') {
        throw new BadRequestException('Invalid enabled');
      }
      data.enabled = input.enabled;
    } else if (requireAll) {
      data.enabled = true;
    }

    if (input.matchType !== undefined) {
      if (
        !Object.values(ContentPolicyMatchType).includes(
          input.matchType as ContentPolicyMatchType,
        )
      ) {
        throw new BadRequestException('Invalid matchType');
      }
      data.matchType = input.matchType;
    } else if (requireAll) {
      throw new BadRequestException('Invalid matchType');
    }

    if (input.action !== undefined) {
      if (input.action !== ContentPolicyAction.BLOCK) {
        throw new BadRequestException('Invalid action');
      }
      data.action = input.action;
    } else if (requireAll) {
      data.action = ContentPolicyAction.BLOCK;
    }

    if (
      typeof data.pattern === 'string' &&
      data.pattern.length > 256
    ) {
      throw new BadRequestException('Pattern is too long');
    }
    if (
      typeof data.pattern === 'string' &&
      data.matchType !== undefined
    ) {
      this.assertPatternIsSafe(
        data.matchType as ContentPolicyMatchType,
        data.pattern,
      );
    }
    if (!requireAll && Object.keys(data).length === 0) {
      throw new BadRequestException(
        'At least one content policy field is required',
      );
    }
    return data;
  }

  private assertPatternIsSafe(
    matchType: ContentPolicyMatchType,
    pattern: string,
  ): void {
    if (
      matchType === ContentPolicyMatchType.REGEX &&
      !this.isConservativeRegex(pattern)
    ) {
      throw new BadRequestException('Unsafe regular expression');
    }
  }

  private matches(rule: ContentPolicyRule, input: string): boolean {
    if (rule.matchType === ContentPolicyMatchType.KEYWORD) {
      return input.includes(rule.pattern);
    }

    if (!this.isConservativeRegex(rule.pattern)) {
      return false;
    }

    try {
      return new RegExp(rule.pattern, 'iu').test(input);
    } catch {
      return false;
    }
  }

  private isConservativeRegex(pattern: string): boolean {
    return (
      pattern.length > 0 &&
      pattern.length <= 256 &&
      !pattern.includes('(?') &&
      !/\\[1-9]/.test(pattern) &&
      !/\([^)]*[+*][^)]*\)[+*{]/.test(pattern)
    );
  }

  private async disableProduction(
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    await transaction.complianceProfile.updateMany({
      where: {
        profileKey: 'default',
        productionEnabled: true,
      },
      data: { productionEnabled: false },
    });
  }
}
