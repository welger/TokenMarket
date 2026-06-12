ALTER TABLE "Model"
ADD COLUMN "capabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Model"
ADD CONSTRAINT "Model_capabilities_bounded"
CHECK (
  cardinality("capabilities") <= 20
  AND array_position("capabilities", '') IS NULL
);
