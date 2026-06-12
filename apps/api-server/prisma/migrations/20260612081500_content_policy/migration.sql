CREATE TYPE "ContentPolicyMatchType" AS ENUM ('KEYWORD', 'REGEX');
CREATE TYPE "ContentPolicyAction" AS ENUM ('BLOCK');

ALTER TABLE "ComplianceProfile" ADD COLUMN "profileKey" TEXT;

UPDATE "ComplianceProfile"
SET "profileKey" = 'legacy:' || "id";

UPDATE "ComplianceProfile"
SET "profileKey" = 'default'
WHERE "id" = (
  SELECT "id"
  FROM "ComplianceProfile"
  ORDER BY "updatedAt" DESC, "id" DESC
  LIMIT 1
);

ALTER TABLE "ComplianceProfile"
ALTER COLUMN "profileKey" SET DEFAULT 'default',
ALTER COLUMN "profileKey" SET NOT NULL;

CREATE UNIQUE INDEX "ComplianceProfile_profileKey_key"
ON "ComplianceProfile"("profileKey");

CREATE TABLE "ContentPolicyRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "category" TEXT NOT NULL,
    "matchType" "ContentPolicyMatchType" NOT NULL,
    "pattern" TEXT NOT NULL,
    "action" "ContentPolicyAction" NOT NULL DEFAULT 'BLOCK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPolicyRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentPolicyEvent" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT,
    "category" TEXT NOT NULL,
    "action" "ContentPolicyAction" NOT NULL,
    "requestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentPolicyEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContentPolicyRule_enabled_category_idx"
ON "ContentPolicyRule"("enabled", "category");

CREATE INDEX "ContentPolicyRule_createdAt_idx"
ON "ContentPolicyRule"("createdAt");

CREATE INDEX "ContentPolicyEvent_requestId_idx"
ON "ContentPolicyEvent"("requestId");

CREATE INDEX "ContentPolicyEvent_ruleId_createdAt_idx"
ON "ContentPolicyEvent"("ruleId", "createdAt");

CREATE INDEX "ContentPolicyEvent_category_createdAt_idx"
ON "ContentPolicyEvent"("category", "createdAt");

ALTER TABLE "ContentPolicyRule"
  ADD CONSTRAINT "ContentPolicyRule_category_nonempty"
    CHECK (length(trim("category")) > 0),
  ADD CONSTRAINT "ContentPolicyRule_pattern_bounded"
    CHECK (length("pattern") > 0 AND length("pattern") <= 256);

ALTER TABLE "ContentPolicyEvent"
  ADD CONSTRAINT "ContentPolicyEvent_requestId_nonempty"
    CHECK (length(trim("requestId")) > 0);

ALTER TABLE "ContentPolicyEvent"
ADD CONSTRAINT "ContentPolicyEvent_ruleId_fkey"
FOREIGN KEY ("ruleId") REFERENCES "ContentPolicyRule"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
