import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../common/prisma/prisma.service.js';
import { UserPlanStatus } from '../generated/prisma/client.js';

interface Pagination {
  page: number;
  pageSize: number;
}

@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(userId: string) {
    const now = new Date();
    const periodStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const periodEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    const [usage, plans] = await Promise.all([
      this.prisma.apiCall.aggregate({
        where: {
          userId,
          createdAt: { gte: periodStart, lt: periodEnd },
        },
        _count: { _all: true },
        _sum: {
          inputCharacters: true,
          outputCharacters: true,
          chargedUnits: true,
        },
      }),
      this.prisma.userPlan.findMany({
        where: {
          userId,
          status: {
            in: [
              UserPlanStatus.ACTIVE,
              UserPlanStatus.PENDING,
              UserPlanStatus.EXHAUSTED,
            ],
          },
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: now } },
          ],
        },
        select: {
          remainingInputQuota: true,
          remainingOutputQuota: true,
          remainingUnifiedQuota: true,
        },
      }),
    ]);
    const remainingUnits = plans.reduce(
      (total, plan) =>
        total +
        (plan.remainingUnifiedQuota ??
          (plan.remainingInputQuota ?? 0n) +
            (plan.remainingOutputQuota ?? 0n)),
      0n,
    );

    return {
      periodStart,
      periodEnd,
      callCount: usage._count._all,
      inputCharacters: usage._sum.inputCharacters ?? 0,
      outputCharacters: usage._sum.outputCharacters ?? 0,
      chargedUnits: this.safeNumber(
        usage._sum.chargedUnits ?? 0n,
      ),
      remainingUnits: this.safeNumber(remainingUnits),
    };
  }

  async apiCalls(
    userId: string,
    pageValue?: string,
    pageSizeValue?: string,
  ) {
    const { page, pageSize } = this.pagination(
      pageValue,
      pageSizeValue,
    );
    const where = { userId };
    const [items, total] = await Promise.all([
      this.prisma.apiCall.findMany({
        where,
        select: {
          id: true,
          requestId: true,
          modelId: true,
          inputCharacters: true,
          outputCharacters: true,
          chargedUnits: true,
          httpStatus: true,
          errorCode: true,
          durationMs: true,
          upstreamRequestId: true,
          errorSummary: true,
          createdAt: true,
          apiKey: { select: { name: true } },
          model: { select: { name: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.apiCall.count({ where }),
    ]);

    return {
      items: items.map(({ apiKey, model, ...call }) => ({
        ...call,
        apiKeyLabel: apiKey.name,
        modelName: model.name,
      })),
      page,
      pageSize,
      total,
    };
  }

  async plans(
    userId: string,
    pageValue?: string,
    pageSizeValue?: string,
  ) {
    const { page, pageSize } = this.pagination(
      pageValue,
      pageSizeValue,
    );
    const where = { userId };
    const [items, total] = await Promise.all([
      this.prisma.userPlan.findMany({
        where,
        include: {
          plan: {
            include: {
              models: {
                select: {
                  id: true,
                  name: true,
                  displayName: true,
                },
              },
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.userPlan.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }

  private pagination(
    pageValue?: string,
    pageSizeValue?: string,
  ): Pagination {
    const page = this.positiveInteger(pageValue, 1, 'page');
    const pageSize = this.positiveInteger(
      pageSizeValue,
      20,
      'pageSize',
    );
    if (pageSize > 100) {
      throw new BadRequestException('pageSize must not exceed 100');
    }
    return { page, pageSize };
  }

  private positiveInteger(
    value: string | undefined,
    fallback: number,
    field: string,
  ): number {
    if (value === undefined) {
      return fallback;
    }
    if (!/^[1-9]\d*$/.test(value)) {
      throw new BadRequestException(`Invalid ${field}`);
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw new BadRequestException(`Invalid ${field}`);
    }
    return parsed;
  }

  private safeNumber(value: bigint): number {
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('USAGE_VALUE_EXCEEDS_SAFE_INTEGER');
    }
    return Number(value);
  }
}
