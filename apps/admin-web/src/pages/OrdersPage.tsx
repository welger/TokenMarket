import { ReloadOutlined } from "@ant-design/icons";
import {
  App as AntdApp,
  Button,
  Card,
  Modal,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import { useCallback, useEffect, useState } from "react";

import {
  adminApi,
  type InvoiceRecord,
  type OrderRecord,
  type PlatformError,
  type RefundRecord,
} from "../api/client";
import { PlatformErrorAlert } from "../components/PlatformErrorAlert";
import {
  formatAdminDateTime,
  formatStatus,
  sortByCreatedAtDesc,
} from "./orders-display";

const statusColors: Record<string, string> = {
  FULFILLED: "green",
  PAID: "blue",
  PENDING_PAYMENT: "gold",
  REFUND_PENDING: "orange",
  REFUNDED: "default",
  SUBMITTED: "gold",
  APPROVED: "blue",
  ISSUED: "green",
  REJECTED: "red",
};

function StatusTag({ value }: { value: string }) {
  return (
    <Tag color={statusColors[value] ?? "default"}>
      {formatStatus(value)}
    </Tag>
  );
}

export function OrdersPage() {
  const { message, modal } = AntdApp.useApp();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<PlatformError | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orderRows, refundRows, invoiceRows] = await Promise.all([
        adminApi.listOrders(),
        adminApi.listRefunds(),
        adminApi.listInvoices(),
      ]);
      setOrders(orderRows);
      setRefunds(refundRows);
      setInvoices(invoiceRows);
    } catch (caught) {
      setError(caught as PlatformError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedOrders = sortByCreatedAtDesc(orders);
  const sortedRefunds = sortByCreatedAtDesc(refunds);
  const sortedInvoices = sortByCreatedAtDesc(invoices);

  const runConfirmed = (
    title: string,
    content: string,
    action: () => Promise<unknown>,
    danger = false,
  ) => {
    modal.confirm({
      title,
      content,
      okText: "确认执行",
      cancelText: "取消",
      okButtonProps: { danger },
      onOk: async () => {
        try {
          await action();
          message.success("操作已完成");
          await load();
        } catch (caught) {
          setError(caught as PlatformError);
        }
      },
    });
  };

  return (
    <Space orientation="vertical" size={20} style={{ width: "100%" }}>
      <div className="page-heading">
        <div>
          <Typography.Title level={2}>订单与财务</Typography.Title>
          <Typography.Text type="secondary">
            查看订单、测试支付、退款审核和发票处理记录。
          </Typography.Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>
          刷新
        </Button>
      </div>
      <PlatformErrorAlert error={error} />
      <Card>
        <Tabs
          items={[
            {
              key: "orders",
              label: `订单 ${orders.length}`,
              children: (
                <Table
                  rowKey="id"
                  loading={loading}
                  dataSource={sortedOrders}
                  pagination={{ pageSize: 10 }}
                  columns={[
                    {
                      title: "订单号",
                      dataIndex: "orderNumber",
                      render: (value) => <code>{value}</code>,
                    },
                    {
                      title: "套餐",
                      render: (_, row) => row.plan?.name ?? row.plan?.id,
                    },
                    {
                      title: "金额",
                      render: (_, row) =>
                        `${row.currency} ${(row.amountMinor / 100).toFixed(2)}`,
                    },
                    {
                      title: "支付",
                      dataIndex: "paymentDriver",
                      render: (value) =>
                        value === "TEST" ? "测试支付" : "微信支付",
                    },
                    {
                      title: "状态",
                      dataIndex: "status",
                      render: (value) => <StatusTag value={value} />,
                    },
                    {
                      title: "创建时间",
                      dataIndex: "createdAt",
                      render: (value) => formatAdminDateTime(value),
                    },
                    {
                      title: "操作",
                      render: (_, row) =>
                        row.status === "PENDING_PAYMENT" ? (
                          <Button
                            type="link"
                            onClick={() =>
                              runConfirmed(
                                "执行测试支付",
                                "仅用于本地测试，不会产生真实扣款。",
                                () => adminApi.payTestOrder(row.id),
                              )
                            }
                          >
                            测试支付
                          </Button>
                        ) : null,
                    },
                  ]}
                />
              ),
            },
            {
              key: "refunds",
              label: `退款 ${refunds.length}`,
              children: (
                <Table
                  rowKey="id"
                  loading={loading}
                  dataSource={sortedRefunds}
                  pagination={{ pageSize: 10 }}
                  columns={[
                    { title: "退款 ID", dataIndex: "id", render: (value) => <code>{value}</code> },
                    { title: "订单号", render: (_, row) => row.order?.orderNumber ?? row.orderId },
                    {
                      title: "金额",
                      render: (_, row) =>
                        `${row.currency} ${(row.amountMinor / 100).toFixed(2)}`,
                    },
                    { title: "原因", dataIndex: "reason" },
                    {
                      title: "状态",
                      dataIndex: "status",
                      render: (value) => <StatusTag value={value} />,
                    },
                    {
                      title: "操作",
                      render: (_, row) => (
                        <Space>
                          {row.status === "SUBMITTED" && (
                            <>
                              <Button
                                type="link"
                                onClick={() =>
                                  runConfirmed(
                                    "批准退款",
                                    "批准后测试订单将进入待退款状态。",
                                    () => adminApi.reviewRefund(row.id, "APPROVE"),
                                  )
                                }
                              >
                                批准
                              </Button>
                              <Button
                                type="link"
                                danger
                                onClick={() =>
                                  runConfirmed(
                                    "驳回退款",
                                    "确认驳回该退款申请？",
                                    () => adminApi.reviewRefund(row.id, "REJECT"),
                                    true,
                                  )
                                }
                              >
                                驳回
                              </Button>
                            </>
                          )}
                          {row.status === "APPROVED" && (
                            <Button
                              type="link"
                              onClick={() =>
                                runConfirmed(
                                  "完成测试退款",
                                  "仅更新本地测试状态，不会产生真实资金流。",
                                  () => adminApi.completeTestRefund(row.id),
                                )
                              }
                            >
                              完成测试退款
                            </Button>
                          )}
                        </Space>
                      ),
                    },
                  ]}
                />
              ),
            },
            {
              key: "invoices",
              label: `发票 ${invoices.length}`,
              children: (
                <Table
                  rowKey="id"
                  loading={loading}
                  dataSource={sortedInvoices}
                  pagination={{ pageSize: 10 }}
                  columns={[
                    { title: "抬头", dataIndex: "title" },
                    { title: "税号", dataIndex: "taxNumber", render: (value) => value || "未填写" },
                    {
                      title: "金额",
                      render: (_, row) =>
                        `${row.currency} ${(row.amountMinor / 100).toFixed(2)}`,
                    },
                    {
                      title: "状态",
                      dataIndex: "status",
                      render: (value) => <StatusTag value={value} />,
                    },
                    {
                      title: "操作",
                      render: (_, row) => (
                        <Space>
                          {row.status === "SUBMITTED" && (
                            <>
                              <Button
                                type="link"
                                onClick={() =>
                                  runConfirmed(
                                    "批准发票申请",
                                    "批准后仍需接入真实开票服务才能开具。",
                                    () => adminApi.reviewInvoice(row.id, "APPROVE"),
                                  )
                                }
                              >
                                批准
                              </Button>
                              <Button
                                type="link"
                                danger
                                onClick={() =>
                                  runConfirmed(
                                    "驳回发票申请",
                                    "确认驳回该发票申请？",
                                    () => adminApi.reviewInvoice(row.id, "REJECT"),
                                    true,
                                  )
                                }
                              >
                                驳回
                              </Button>
                            </>
                          )}
                          {row.status === "APPROVED" && (
                            <Button
                              type="link"
                              onClick={() =>
                                runConfirmed(
                                  "尝试开具发票",
                                  "当前未配置真实电子发票驱动，后端会明确返回不可用。",
                                  () => adminApi.issueInvoice(row.id),
                                )
                              }
                            >
                              开具
                            </Button>
                          )}
                        </Space>
                      ),
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>
    </Space>
  );
}
