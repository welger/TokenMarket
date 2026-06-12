CREATE TYPE "RefundStatus" AS ENUM (
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'REFUNDED'
);

CREATE TYPE "InvoiceStatus" AS ENUM (
  'SUBMITTED',
  'APPROVED',
  'ISSUED',
  'REJECTED'
);

CREATE UNIQUE INDEX "Order_id_userId_key"
ON "Order"("id", "userId");

DROP INDEX "Order_idempotencyKey_key";

CREATE UNIQUE INDEX "Order_userId_idempotencyKey_key"
ON "Order"("userId", "idempotencyKey");

CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewedByAdminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "taxNumber" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewedByAdminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceOrder" (
    "invoiceId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "InvoiceOrder_pkey" PRIMARY KEY ("invoiceId", "orderId")
);

CREATE UNIQUE INDEX "Invoice_id_userId_key"
ON "Invoice"("id", "userId");

CREATE INDEX "Refund_userId_createdAt_idx"
ON "Refund"("userId", "createdAt");
CREATE INDEX "Refund_orderId_createdAt_idx"
ON "Refund"("orderId", "createdAt");
CREATE INDEX "Refund_status_createdAt_idx"
ON "Refund"("status", "createdAt");
CREATE INDEX "Refund_reviewedByAdminId_reviewedAt_idx"
ON "Refund"("reviewedByAdminId", "reviewedAt");

CREATE INDEX "Invoice_userId_createdAt_idx"
ON "Invoice"("userId", "createdAt");
CREATE INDEX "Invoice_status_createdAt_idx"
ON "Invoice"("status", "createdAt");
CREATE INDEX "Invoice_reviewedByAdminId_reviewedAt_idx"
ON "Invoice"("reviewedByAdminId", "reviewedAt");

CREATE INDEX "InvoiceOrder_orderId_idx"
ON "InvoiceOrder"("orderId");
CREATE INDEX "InvoiceOrder_userId_idx"
ON "InvoiceOrder"("userId");

ALTER TABLE "Refund"
  ADD CONSTRAINT "Refund_amountMinor_positive"
    CHECK ("amountMinor" > 0),
  ADD CONSTRAINT "Refund_reason_nonempty"
    CHECK (length(trim("reason")) > 0);

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_amountMinor_positive"
    CHECK ("amountMinor" > 0),
  ADD CONSTRAINT "Invoice_title_nonempty"
    CHECK (length(trim("title")) > 0);

ALTER TABLE "Refund"
ADD CONSTRAINT "Refund_order_owner_fkey"
FOREIGN KEY ("orderId", "userId") REFERENCES "Order"("id", "userId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Refund"
ADD CONSTRAINT "Refund_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Refund"
ADD CONSTRAINT "Refund_reviewedByAdminId_fkey"
FOREIGN KEY ("reviewedByAdminId") REFERENCES "AdminUser"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Invoice"
ADD CONSTRAINT "Invoice_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Invoice"
ADD CONSTRAINT "Invoice_reviewedByAdminId_fkey"
FOREIGN KEY ("reviewedByAdminId") REFERENCES "AdminUser"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InvoiceOrder"
ADD CONSTRAINT "InvoiceOrder_invoice_owner_fkey"
FOREIGN KEY ("invoiceId", "userId") REFERENCES "Invoice"("id", "userId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InvoiceOrder"
ADD CONSTRAINT "InvoiceOrder_order_owner_fkey"
FOREIGN KEY ("orderId", "userId") REFERENCES "Order"("id", "userId")
ON DELETE RESTRICT ON UPDATE CASCADE;
