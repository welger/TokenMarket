import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';

import { Prisma, PrismaClient } from '../../generated/prisma/client.js';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://gateway:gateway_local@127.0.0.1:5432/gateway';
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});
type BusinessRowCount = { tableName: string; rowCount: number };

async function getBusinessRowCounts(): Promise<BusinessRowCount[]> {
  return prisma.$queryRaw<BusinessRowCount[]>`
    SELECT 'ApiCall' AS "tableName", COUNT(*)::int AS "rowCount" FROM "ApiCall"
    UNION ALL
    SELECT 'ApiKey', COUNT(*)::int FROM "ApiKey"
    UNION ALL
    SELECT 'Model', COUNT(*)::int FROM "Model"
    UNION ALL
    SELECT 'Order', COUNT(*)::int FROM "Order"
    UNION ALL
    SELECT 'Plan', COUNT(*)::int FROM "Plan"
    UNION ALL
    SELECT 'Provider', COUNT(*)::int FROM "Provider"
    UNION ALL
    SELECT 'UsageLedger', COUNT(*)::int FROM "UsageLedger"
    UNION ALL
    SELECT 'User', COUNT(*)::int FROM "User"
    UNION ALL
    SELECT 'UserPlan', COUNT(*)::int FROM "UserPlan"
    ORDER BY "tableName"
  `;
}

async function inRollback(
  operation: (transaction: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  const rollback = new Error('ROLLBACK_DATABASE_INTEGRITY_TEST');

  try {
    await prisma.$transaction(async (transaction) => {
      await operation(transaction);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) {
      throw error;
    }
  }
}

async function insertUser(
  transaction: Prisma.TransactionClient,
  id = randomUUID(),
): Promise<string> {
  await transaction.$executeRaw`
    INSERT INTO "User" ("id", "status", "createdAt", "updatedAt")
    VALUES (${id}, 'ACTIVE', NOW(), NOW())
  `;
  return id;
}

async function insertPlan(
  transaction: Prisma.TransactionClient,
  id = randomUUID(),
): Promise<string> {
  await transaction.$executeRaw`
    INSERT INTO "Plan" (
      "id", "name", "description", "priceMinor", "currency",
      "unifiedQuota", "activationMode", "validityDays",
      "refundPolicy", "purchaseNotice", "status", "createdAt", "updatedAt"
    )
    VALUES (
      ${id}, 'Local test plan', 'Database constraint test', 100, 'CNY',
      1000, 'IMMEDIATE', 30,
      'Local test only', 'Local test only', 'DRAFT', NOW(), NOW()
    )
  `;
  return id;
}

async function insertOrder(
  transaction: Prisma.TransactionClient,
  userId: string,
  planId: string,
  id = randomUUID(),
): Promise<string> {
  await transaction.$executeRaw`
    INSERT INTO "Order" (
      "id", "orderNumber", "userId", "planId", "amountMinor",
      "currency", "status", "paymentDriver", "createdAt", "updatedAt"
    )
    VALUES (
      ${id}, ${`order-${id}`}, ${userId}, ${planId}, 100,
      'CNY', 'PENDING_PAYMENT', 'TEST', NOW(), NOW()
    )
  `;
  return id;
}

async function insertProviderAndModel(
  transaction: Prisma.TransactionClient,
): Promise<string> {
  const providerId = randomUUID();
  const modelId = randomUUID();

  await transaction.$executeRaw`
    INSERT INTO "Provider" (
      "id", "name", "displayName", "configRef", "disclosurePurpose",
      "region", "status", "routingPriority", "createdAt", "updatedAt"
    )
    VALUES (
      ${providerId}, ${`provider-${providerId}`}, 'Local provider',
      ${`provider-config-${providerId}`}, 'Database constraint test',
      'local', 'ACTIVE', 100, NOW(), NOW()
    )
  `;
  await transaction.$executeRaw`
    INSERT INTO "Model" (
      "id", "providerId", "name", "upstreamModel", "displayName",
      "description", "inputUnit", "outputUnit", "contextWindow",
      "inputMultiplier", "outputMultiplier", "status", "routingPriority",
      "createdAt", "updatedAt"
    )
    VALUES (
      ${modelId}, ${providerId}, ${`model-${modelId}`}, 'local-model',
      'Local model', 'Database constraint test', 'CHARACTER', 'CHARACTER',
      8192, 1, 1, 'AVAILABLE', 100, NOW(), NOW()
    )
  `;

  return modelId;
}

async function insertApiKey(
  transaction: Prisma.TransactionClient,
  userId: string,
  id = randomUUID(),
): Promise<string> {
  await transaction.$executeRaw`
    INSERT INTO "ApiKey" (
      "id", "userId", "name", "prefix", "lastFour",
      "secretHash", "status", "createdAt"
    )
    VALUES (
      ${id}, ${userId}, 'Local test key', 'sk-gw', 'TEST',
      ${`hash-${id}`}, 'ACTIVE', NOW()
    )
  `;
  return id;
}

async function insertUserPlan(
  transaction: Prisma.TransactionClient,
  userId: string,
  planId: string,
  id = randomUUID(),
): Promise<string> {
  await transaction.$executeRaw`
    INSERT INTO "UserPlan" (
      "id", "userId", "planId", "fulfillmentType", "status",
      "initialUnifiedQuota", "remainingUnifiedQuota",
      "createdAt", "updatedAt"
    )
    VALUES (
      ${id}, ${userId}, ${planId}, 'ADMIN_GRANT', 'ACTIVE',
      1000, 1000, NOW(), NOW()
    )
  `;
  return id;
}

async function insertApiCall(
  transaction: Prisma.TransactionClient,
  userId: string,
  apiKeyId: string,
  modelId: string,
  userPlanId: string,
  id = randomUUID(),
): Promise<string> {
  await transaction.$executeRaw`
    INSERT INTO "ApiCall" (
      "id", "requestId", "userId", "apiKeyId", "modelId", "userPlanId",
      "inputCharacters", "outputCharacters", "inputChargedUnits",
      "outputChargedUnits", "chargedUnits", "httpStatus", "durationMs",
      "createdAt"
    )
    VALUES (
      ${id}, ${`request-${id}`}, ${userId}, ${apiKeyId}, ${modelId},
      ${userPlanId}, 10, 20, 10, 20, 30, 200, 50, NOW()
    )
  `;
  return id;
}

describe('database integrity constraints', () => {
  let initialRowCounts: BusinessRowCount[];

  beforeAll(async () => {
    await prisma.$connect();
    initialRowCounts = await getBusinessRowCounts();
  });

  afterAll(async () => {
    try {
      expect(await getBusinessRowCounts()).toEqual(initialRowCounts);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('rejects a negative order amount', async () => {
    await inRollback(async (transaction) => {
      const userId = await insertUser(transaction);
      const planId = await insertPlan(transaction);
      const id = randomUUID();

      await expect(transaction.$executeRaw`
        INSERT INTO "Order" (
          "id", "orderNumber", "userId", "planId", "amountMinor",
          "currency", "status", "paymentDriver", "createdAt", "updatedAt"
        )
        VALUES (
          ${id}, ${`order-${id}`}, ${userId}, ${planId}, -1,
          'CNY', 'PENDING_PAYMENT', 'TEST', NOW(), NOW()
        )
      `).rejects.toThrow(/Order_amountMinor_nonnegative/);
    });
  });

  it('rejects a plan that mixes unified and split quotas', async () => {
    await inRollback(async (transaction) => {
      const id = randomUUID();

      await expect(transaction.$executeRaw`
        INSERT INTO "Plan" (
          "id", "name", "description", "priceMinor", "currency",
          "inputQuota", "outputQuota", "unifiedQuota",
          "activationMode", "validityDays", "refundPolicy",
          "purchaseNotice", "status", "createdAt", "updatedAt"
        )
        VALUES (
          ${id}, 'Invalid local plan', 'Database constraint test', 100, 'CNY',
          100, 100, 100, 'IMMEDIATE', 30, 'Local test only',
          'Local test only', 'DRAFT', NOW(), NOW()
        )
      `).rejects.toThrow(/Plan_quota_mode_valid/);
    });
  });

  it('rejects negative plan prices and nonpositive validity', async () => {
    await inRollback(async (transaction) => {
      const id = randomUUID();
      await expect(transaction.$executeRaw`
        INSERT INTO "Plan" (
          "id", "name", "description", "priceMinor", "currency",
          "unifiedQuota", "activationMode", "validityDays",
          "refundPolicy", "purchaseNotice", "status", "createdAt", "updatedAt"
        )
        VALUES (
          ${id}, 'Negative price plan', 'Database constraint test', -1, 'CNY',
          100, 'IMMEDIATE', 30, 'Local test only',
          'Local test only', 'DRAFT', NOW(), NOW()
        )
      `).rejects.toThrow(/Plan_priceMinor_nonnegative/);
    });

    await inRollback(async (transaction) => {
      const id = randomUUID();
      await expect(transaction.$executeRaw`
        INSERT INTO "Plan" (
          "id", "name", "description", "priceMinor", "currency",
          "unifiedQuota", "activationMode", "validityDays",
          "refundPolicy", "purchaseNotice", "status", "createdAt", "updatedAt"
        )
        VALUES (
          ${id}, 'Invalid validity plan', 'Database constraint test', 0, 'CNY',
          100, 'IMMEDIATE', 0, 'Local test only',
          'Local test only', 'DRAFT', NOW(), NOW()
        )
      `).rejects.toThrow(/Plan_validityDays_positive/);
    });
  });

  it('rejects invalid model and user plan quantities', async () => {
    await inRollback(async (transaction) => {
      const providerId = randomUUID();
      await transaction.$executeRaw`
        INSERT INTO "Provider" (
          "id", "name", "displayName", "configRef", "disclosurePurpose",
          "region", "status", "routingPriority", "createdAt", "updatedAt"
        )
        VALUES (
          ${providerId}, ${`provider-${providerId}`}, 'Local provider',
          ${`provider-config-${providerId}`}, 'Database constraint test',
          'local', 'ACTIVE', 100, NOW(), NOW()
        )
      `;

      const modelId = randomUUID();
      await expect(transaction.$executeRaw`
        INSERT INTO "Model" (
          "id", "providerId", "name", "upstreamModel", "displayName",
          "description", "inputUnit", "outputUnit", "contextWindow",
          "inputMultiplier", "outputMultiplier", "status", "routingPriority",
          "createdAt", "updatedAt"
        )
        VALUES (
          ${modelId}, ${providerId}, ${`model-${modelId}`}, 'invalid-model',
          'Invalid model', 'Database constraint test', 'CHARACTER', 'CHARACTER',
          0, -1, 1, 'UNAVAILABLE', 100, NOW(), NOW()
        )
      `).rejects.toThrow(/Model_values_nonnegative/);
    });

    await inRollback(async (transaction) => {
      const userId = await insertUser(transaction);
      const planId = await insertPlan(transaction);
      const userPlanId = randomUUID();
      await expect(transaction.$executeRaw`
        INSERT INTO "UserPlan" (
          "id", "userId", "planId", "fulfillmentType", "status",
          "initialUnifiedQuota", "remainingUnifiedQuota",
          "createdAt", "updatedAt"
        )
        VALUES (
          ${userPlanId}, ${userId}, ${planId}, 'ADMIN_GRANT', 'ACTIVE',
          100, 101, NOW(), NOW()
        )
      `).rejects.toThrow(/UserPlan_quota_values_valid/);
    });
  });

  it('rejects negative API call metrics and ledger remaining snapshots', async () => {
    await inRollback(async (transaction) => {
      const userId = await insertUser(transaction);
      const planId = await insertPlan(transaction);
      const userPlanId = await insertUserPlan(transaction, userId, planId);
      const apiKeyId = await insertApiKey(transaction, userId);
      const modelId = await insertProviderAndModel(transaction);
      const apiCallId = randomUUID();

      await expect(transaction.$executeRaw`
        INSERT INTO "ApiCall" (
          "id", "requestId", "userId", "apiKeyId", "modelId", "userPlanId",
          "inputCharacters", "outputCharacters", "inputChargedUnits",
          "outputChargedUnits", "chargedUnits", "httpStatus", "durationMs",
          "createdAt"
        )
        VALUES (
          ${apiCallId}, ${`request-${apiCallId}`}, ${userId}, ${apiKeyId},
          ${modelId}, ${userPlanId}, -1, 0, 0, 0, 0, 200, 0, NOW()
        )
      `).rejects.toThrow(/ApiCall_metrics_nonnegative/);
    });

    await inRollback(async (transaction) => {
      const userId = await insertUser(transaction);
      const planId = await insertPlan(transaction);
      const userPlanId = await insertUserPlan(transaction, userId, planId);
      const ledgerId = randomUUID();
      await expect(transaction.$executeRaw`
        INSERT INTO "UsageLedger" (
          "id", "userId", "userPlanId", "type",
          "inputUnits", "outputUnits", "chargedUnits",
          "remainingUnified", "createdAt"
        )
        VALUES (
          ${ledgerId}, ${userId}, ${userPlanId}, 'ADJUSTMENT',
          -10, 0, -10, -1, NOW()
        )
      `).rejects.toThrow(/UsageLedger_remaining_nonnegative/);
    });
  });

  it('accepts valid records and signed ledger deltas', async () => {
    await inRollback(async (transaction) => {
      const userId = await insertUser(transaction);
      const planId = await insertPlan(transaction);
      const orderId = await insertOrder(transaction, userId, planId);
      const userPlanId = await insertUserPlan(transaction, userId, planId);

      await expect(transaction.$executeRaw`
        INSERT INTO "UsageLedger" (
          "id", "userId", "userPlanId", "type",
          "inputUnits", "outputUnits", "chargedUnits",
          "remainingUnified", "description", "createdAt"
        )
        VALUES (
          ${randomUUID()}, ${userId}, ${userPlanId}, 'ADJUSTMENT',
          -5, 0, -5, 995, 'Signed adjustment delta', NOW()
        )
      `).resolves.toBe(1);

      expect(orderId).toBeTruthy();
    });
  });

  it('rejects an API call whose key or plan belongs to another user', async () => {
    await inRollback(async (transaction) => {
      const firstUserId = await insertUser(transaction);
      const secondUserId = await insertUser(transaction);
      const planId = await insertPlan(transaction);
      const secondUserPlanId = await insertUserPlan(
        transaction,
        secondUserId,
        planId,
      );
      const secondUserKeyId = await insertApiKey(transaction, secondUserId);
      const modelId = await insertProviderAndModel(transaction);

      await expect(
        insertApiCall(
          transaction,
          firstUserId,
          secondUserKeyId,
          modelId,
          secondUserPlanId,
        ),
      ).rejects.toThrow(/ApiCall_apiKey_owner_fkey/);
    });

    await inRollback(async (transaction) => {
      const firstUserId = await insertUser(transaction);
      const secondUserId = await insertUser(transaction);
      const planId = await insertPlan(transaction);
      const secondUserPlanId = await insertUserPlan(
        transaction,
        secondUserId,
        planId,
      );
      const firstUserKeyId = await insertApiKey(transaction, firstUserId);
      const modelId = await insertProviderAndModel(transaction);
      await expect(
        insertApiCall(
          transaction,
          firstUserId,
          firstUserKeyId,
          modelId,
          secondUserPlanId,
        ),
      ).rejects.toThrow(/ApiCall_userPlan_owner_fkey/);
    });
  });

  it('rejects a usage ledger whose plan or API call belongs to another user', async () => {
    await inRollback(async (transaction) => {
      const firstUserId = await insertUser(transaction);
      const secondUserId = await insertUser(transaction);
      const planId = await insertPlan(transaction);
      const secondUserPlanId = await insertUserPlan(
        transaction,
        secondUserId,
        planId,
      );

      await expect(transaction.$executeRaw`
        INSERT INTO "UsageLedger" (
          "id", "userId", "userPlanId", "type", "createdAt"
        )
        VALUES (
          ${randomUUID()}, ${firstUserId}, ${secondUserPlanId},
          'ADJUSTMENT', NOW()
        )
      `).rejects.toThrow(/UsageLedger_userPlan_owner_fkey/);
    });

    await inRollback(async (transaction) => {
      const firstUserId = await insertUser(transaction);
      const secondUserId = await insertUser(transaction);
      const planId = await insertPlan(transaction);
      const firstUserPlanId = await insertUserPlan(
        transaction,
        firstUserId,
        planId,
      );
      const secondUserPlanId = await insertUserPlan(
        transaction,
        secondUserId,
        planId,
      );
      const secondUserKeyId = await insertApiKey(transaction, secondUserId);
      const modelId = await insertProviderAndModel(transaction);
      const secondUserCallId = await insertApiCall(
        transaction,
        secondUserId,
        secondUserKeyId,
        modelId,
        secondUserPlanId,
      );
      await expect(transaction.$executeRaw`
        INSERT INTO "UsageLedger" (
          "id", "userId", "userPlanId", "apiCallId", "type", "createdAt"
        )
        VALUES (
          ${randomUUID()}, ${firstUserId}, ${firstUserPlanId},
          ${secondUserCallId}, 'ADJUSTMENT', NOW()
        )
      `).rejects.toThrow(/UsageLedger_apiCall_owner_fkey/);
    });
  });

  it('preserves user history instead of cascading physical deletion', async () => {
    await inRollback(async (transaction) => {
      const userId = await insertUser(transaction);
      await insertApiKey(transaction, userId);

      await expect(
        transaction.$executeRaw`DELETE FROM "User" WHERE "id" = ${userId}`,
      ).rejects.toThrow(/ApiKey_userId_fkey/);
    });
  });

  it('uses RESTRICT for user history and fulfillment source foreign keys', async () => {
    const constraintNames = [
      'ApiKey_userId_fkey',
      'UserPlan_userId_fkey',
      'UsageLedger_userId_fkey',
      'ApiCall_userId_fkey',
      'Order_userId_fkey',
      'UserPlan_orderId_fkey',
    ];
    const constraints = await prisma.$queryRaw<
      Array<{ conname: string; confdeltype: string }>
    >`
      SELECT "conname", "confdeltype"::text AS "confdeltype"
      FROM "pg_constraint"
      WHERE "conname" IN (
        'ApiKey_userId_fkey',
        'UserPlan_userId_fkey',
        'UsageLedger_userId_fkey',
        'ApiCall_userId_fkey',
        'Order_userId_fkey',
        'UserPlan_orderId_fkey'
      )
      ORDER BY "conname"
    `;

    expect(constraints.map(({ conname }) => conname).sort()).toEqual(
      constraintNames.sort(),
    );
    expect(constraints.every(({ confdeltype }) => confdeltype === 'r')).toBe(
      true,
    );
  });

  it('deduplicates fulfillment by order and fulfillment type', async () => {
    await inRollback(async (transaction) => {
      const userId = await insertUser(transaction);
      const planId = await insertPlan(transaction);
      const orderId = await insertOrder(transaction, userId, planId);

      await transaction.$executeRaw`
        INSERT INTO "UserPlan" (
          "id", "userId", "planId", "orderId", "fulfillmentType", "status",
          "initialUnifiedQuota", "remainingUnifiedQuota",
          "createdAt", "updatedAt"
        )
        VALUES (
          ${randomUUID()}, ${userId}, ${planId}, ${orderId}, 'PURCHASE',
          'ACTIVE', 1000, 1000, NOW(), NOW()
        )
      `;

      await expect(transaction.$executeRaw`
        INSERT INTO "UserPlan" (
          "id", "userId", "planId", "orderId", "fulfillmentType", "status",
          "initialUnifiedQuota", "remainingUnifiedQuota",
          "createdAt", "updatedAt"
        )
        VALUES (
          ${randomUUID()}, ${userId}, ${planId}, ${orderId}, 'REFUND_RESTORE',
          'ACTIVE', 1000, 1000, NOW(), NOW()
        )
      `).resolves.toBe(1);

      await expect(transaction.$executeRaw`
        INSERT INTO "UserPlan" (
          "id", "userId", "planId", "orderId", "fulfillmentType", "status",
          "initialUnifiedQuota", "remainingUnifiedQuota",
          "createdAt", "updatedAt"
        )
        VALUES (
          ${randomUUID()}, ${userId}, ${planId}, ${orderId}, 'PURCHASE',
          'ACTIVE', 1000, 1000, NOW(), NOW()
        )
      `).rejects.toThrow(/UserPlan_orderId_fulfillmentType_key/);
    });
  });
});
