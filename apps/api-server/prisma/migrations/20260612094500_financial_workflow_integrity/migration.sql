DROP INDEX "InvoiceOrder_orderId_idx";

CREATE UNIQUE INDEX "InvoiceOrder_orderId_key"
ON "InvoiceOrder"("orderId");
