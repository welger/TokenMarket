-- Persist administrator login failures so limits remain consistent across
-- application instances and restarts.
CREATE TABLE "AdminLoginThrottle" (
    "keyHash" VARCHAR(64) NOT NULL,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "blockedUntil" TIMESTAMP(3),
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminLoginThrottle_pkey" PRIMARY KEY ("keyHash")
);

CREATE INDEX "AdminLoginThrottle_expiresAt_idx"
ON "AdminLoginThrottle"("expiresAt");

ALTER TABLE "AdminLoginThrottle"
  ADD CONSTRAINT "AdminLoginThrottle_failureCount_nonnegative"
    CHECK ("failureCount" >= 0),
  ADD CONSTRAINT "AdminLoginThrottle_lease_consistent"
    CHECK (
      ("leaseToken" IS NULL AND "leaseExpiresAt" IS NULL)
      OR
      ("leaseToken" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL)
    );
