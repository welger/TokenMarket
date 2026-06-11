/*
  Warnings:

  - A unique constraint covering the columns `[id,userId]` on the table `ApiCall` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id,userId]` on the table `ApiKey` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id,providerId]` on the table `Model` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[apiCallId,userId]` on the table `UsageLedger` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id,userId]` on the table `UserPlan` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[orderId,fulfillmentType]` on the table `UserPlan` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "FulfillmentType" AS ENUM ('PURCHASE', 'ADMIN_GRANT', 'REFUND_RESTORE');

-- DropForeignKey
ALTER TABLE "ApiCall" DROP CONSTRAINT "ApiCall_apiKeyId_fkey";

-- DropForeignKey
ALTER TABLE "ApiCall" DROP CONSTRAINT "ApiCall_userId_fkey";

-- DropForeignKey
ALTER TABLE "ApiCall" DROP CONSTRAINT "ApiCall_userPlanId_fkey";

-- DropForeignKey
ALTER TABLE "ApiKey" DROP CONSTRAINT "ApiKey_userId_fkey";

-- DropForeignKey
ALTER TABLE "UsageLedger" DROP CONSTRAINT "UsageLedger_apiCallId_fkey";

-- DropForeignKey
ALTER TABLE "UsageLedger" DROP CONSTRAINT "UsageLedger_userId_fkey";

-- DropForeignKey
ALTER TABLE "UsageLedger" DROP CONSTRAINT "UsageLedger_userPlanId_fkey";

-- DropForeignKey
ALTER TABLE "UserPlan" DROP CONSTRAINT "UserPlan_orderId_fkey";

-- DropForeignKey
ALTER TABLE "UserPlan" DROP CONSTRAINT "UserPlan_userId_fkey";

-- DropIndex
DROP INDEX "UsageLedger_apiCallId_key";

-- DropIndex
DROP INDEX "UserPlan_orderId_key";

-- AlterTable
ALTER TABLE "UserPlan" ADD COLUMN     "fulfillmentType" "FulfillmentType" NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ApiCall_id_userId_key" ON "ApiCall"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_id_userId_key" ON "ApiKey"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Model_id_providerId_key" ON "Model"("id", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "UsageLedger_apiCallId_userId_key" ON "UsageLedger"("apiCallId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPlan_id_userId_key" ON "UserPlan"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPlan_orderId_fulfillmentType_key" ON "UserPlan"("orderId", "fulfillmentType");

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPlan" ADD CONSTRAINT "UserPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPlan" ADD CONSTRAINT "UserPlan_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageLedger" ADD CONSTRAINT "UsageLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageLedger" ADD CONSTRAINT "UsageLedger_userPlan_owner_fkey" FOREIGN KEY ("userPlanId", "userId") REFERENCES "UserPlan"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageLedger" ADD CONSTRAINT "UsageLedger_apiCall_owner_fkey" FOREIGN KEY ("apiCallId", "userId") REFERENCES "ApiCall"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiCall" ADD CONSTRAINT "ApiCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiCall" ADD CONSTRAINT "ApiCall_apiKey_owner_fkey" FOREIGN KEY ("apiKeyId", "userId") REFERENCES "ApiKey"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiCall" ADD CONSTRAINT "ApiCall_userPlan_owner_fkey" FOREIGN KEY ("userPlanId", "userId") REFERENCES "UserPlan"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Business invariants that Prisma schema cannot express.
ALTER TABLE "Plan"
  ADD CONSTRAINT "Plan_priceMinor_nonnegative"
    CHECK ("priceMinor" >= 0),
  ADD CONSTRAINT "Plan_validityDays_positive"
    CHECK ("validityDays" > 0),
  ADD CONSTRAINT "Plan_quota_mode_valid"
    CHECK (
      (
        "unifiedQuota" IS NOT NULL
        AND "unifiedQuota" >= 0
        AND "inputQuota" IS NULL
        AND "outputQuota" IS NULL
      )
      OR
      (
        "unifiedQuota" IS NULL
        AND "inputQuota" IS NOT NULL
        AND "inputQuota" >= 0
        AND "outputQuota" IS NOT NULL
        AND "outputQuota" >= 0
      )
    );

ALTER TABLE "UserPlan"
  ADD CONSTRAINT "UserPlan_quota_values_valid"
    CHECK (
      (
        "initialUnifiedQuota" IS NOT NULL
        AND "initialUnifiedQuota" >= 0
        AND "remainingUnifiedQuota" IS NOT NULL
        AND "remainingUnifiedQuota" >= 0
        AND "remainingUnifiedQuota" <= "initialUnifiedQuota"
        AND "initialInputQuota" IS NULL
        AND "remainingInputQuota" IS NULL
        AND "initialOutputQuota" IS NULL
        AND "remainingOutputQuota" IS NULL
      )
      OR
      (
        "initialUnifiedQuota" IS NULL
        AND "remainingUnifiedQuota" IS NULL
        AND "initialInputQuota" IS NOT NULL
        AND "initialInputQuota" >= 0
        AND "remainingInputQuota" IS NOT NULL
        AND "remainingInputQuota" >= 0
        AND "remainingInputQuota" <= "initialInputQuota"
        AND "initialOutputQuota" IS NOT NULL
        AND "initialOutputQuota" >= 0
        AND "remainingOutputQuota" IS NOT NULL
        AND "remainingOutputQuota" >= 0
        AND "remainingOutputQuota" <= "initialOutputQuota"
      )
    ),
  ADD CONSTRAINT "UserPlan_purchase_order_required"
    CHECK ("fulfillmentType" <> 'PURCHASE' OR "orderId" IS NOT NULL);

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_amountMinor_nonnegative"
    CHECK ("amountMinor" >= 0);

ALTER TABLE "Model"
  ADD CONSTRAINT "Model_values_nonnegative"
    CHECK (
      "contextWindow" > 0
      AND "inputMultiplier" >= 0
      AND "outputMultiplier" >= 0
    );

ALTER TABLE "ApiCall"
  ADD CONSTRAINT "ApiCall_metrics_nonnegative"
    CHECK (
      "inputCharacters" >= 0
      AND "outputCharacters" >= 0
      AND "inputChargedUnits" >= 0
      AND "outputChargedUnits" >= 0
      AND "chargedUnits" >= 0
      AND "durationMs" >= 0
    );

-- Ledger unit columns are signed deltas for adjustments and restorations.
-- Remaining balance snapshots, when present, must never be negative.
ALTER TABLE "UsageLedger"
  ADD CONSTRAINT "UsageLedger_remaining_nonnegative"
    CHECK (
      ("remainingInput" IS NULL OR "remainingInput" >= 0)
      AND ("remainingOutput" IS NULL OR "remainingOutput" >= 0)
      AND ("remainingUnified" IS NULL OR "remainingUnified" >= 0)
    );
