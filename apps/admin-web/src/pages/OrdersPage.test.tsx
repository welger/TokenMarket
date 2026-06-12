import { describe, expect, it } from "vitest";

import {
  formatAdminDateTime,
  formatStatus,
  sortByCreatedAtDesc,
} from "./orders-display";

describe("OrdersPage display helpers", () => {
  it("shows finance statuses in Chinese", () => {
    expect(formatStatus("PENDING_PAYMENT")).toBe("待支付");
    expect(formatStatus("SUBMITTED")).toBe("待审核");
    expect(formatStatus("ISSUED")).toBe("已开具");
  });

  it("formats timestamps consistently in China Standard Time", () => {
    expect(formatAdminDateTime("2026-06-12T10:30:00.000Z")).toBe(
      "2026-06-12 18:30:00",
    );
  });

  it("sorts finance records by newest creation time first", () => {
    const rows = [
      { id: "older", createdAt: "2026-06-11T10:00:00.000Z" },
      { id: "newer", createdAt: "2026-06-12T10:00:00.000Z" },
    ];

    expect(sortByCreatedAtDesc(rows).map((row) => row.id)).toEqual([
      "newer",
      "older",
    ]);
  });
});
