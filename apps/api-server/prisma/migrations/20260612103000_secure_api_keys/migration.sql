CREATE UNIQUE INDEX "ApiKey_prefix_key"
ON "ApiKey"("prefix");

ALTER TABLE "ApiKey"
  ADD CONSTRAINT "ApiKey_name_nonempty"
    CHECK (length(trim("name")) > 0),
  ADD CONSTRAINT "ApiKey_lastFour_length"
    CHECK (length("lastFour") = 4),
  ADD CONSTRAINT "ApiKey_prefix_format"
    CHECK (left("prefix", 6) = 'sk-gw_'),
  ADD CONSTRAINT "ApiKey_disabled_state_consistent"
    CHECK (
      ("status" = 'ACTIVE' AND "disabledAt" IS NULL)
      OR
      ("status" = 'DISABLED' AND "disabledAt" IS NOT NULL)
    );
