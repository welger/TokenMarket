const statusLabels: Record<string, string> = {
  FULFILLED: "已履约",
  PAID: "已支付",
  PENDING_PAYMENT: "待支付",
  CANCELLED: "已取消",
  REFUND_PENDING: "待退款",
  REFUNDED: "已退款",
  REFUND_REJECTED: "退款已驳回",
  SUBMITTED: "待审核",
  APPROVED: "已批准",
  ISSUED: "已开具",
  REJECTED: "已驳回",
};

export function formatStatus(value: string): string {
  return statusLabels[value] ?? value;
}

export function formatAdminDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(new Date(value))
    .replaceAll("/", "-");
}

export function sortByCreatedAtDesc<T extends { createdAt: string }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() -
      new Date(left.createdAt).getTime(),
  );
}
