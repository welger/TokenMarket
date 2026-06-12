import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  App as AntdApp,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { useCallback, useEffect, useState } from "react";

import {
  adminApi,
  type ModelRecord,
  type PlanRecord,
  type PlatformError,
} from "../api/client";
import { PlatformErrorAlert } from "../components/PlatformErrorAlert";

export function PlansPage() {
  const { message, modal } = AntdApp.useApp();
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanRecord | null>(null);
  const [error, setError] = useState<PlatformError | null>(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [planRows, modelRows] = await Promise.all([
        adminApi.listPlans(),
        adminApi.listModels(),
      ]);
      setPlans(planRows);
      setModels(modelRows);
    } catch (caught) {
      setError(caught as PlatformError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedPlans = [...plans].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() -
      new Date(left.updatedAt).getTime(),
  );

  const openPlan = (plan?: PlanRecord) => {
    setEditingPlan(plan ?? null);
    form.resetFields();
    form.setFieldsValue(
      plan
        ? {
            ...plan,
            priceYuan: plan.priceMinor / 100,
            modelIds: plan.models.map((model) => model.id),
          }
        : {
            currency: "CNY",
            activationMode: "IMMEDIATE",
            validityDays: 30,
            status: "DRAFT",
          },
    );
    setOpen(true);
  };

  const changeStatus = (plan: PlanRecord) => {
    const active = plan.status === "ACTIVE";
    modal.confirm({
      title: `${active ? "下架" : "上架"}套餐`,
      content: `确认${active ? "下架" : "上架"}“${plan.name}”？该操作会关闭生产模式并写入审计日志。`,
      okText: "确认",
      cancelText: "取消",
      okButtonProps: { danger: active },
      onOk: async () => {
        try {
          await adminApi.updatePlan(plan.id, {
            status: active ? "INACTIVE" : "ACTIVE",
          });
          message.success("套餐状态已更新");
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
          <Typography.Title level={2}>服务套餐</Typography.Title>
          <Typography.Text type="secondary">
            配置价格、字符额度、适用模型、有效期和退款条件。
          </Typography.Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openPlan()}>
            新增套餐
          </Button>
        </Space>
      </div>
      <PlatformErrorAlert error={error} />
      <Card>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={sortedPlans}
          pagination={{ pageSize: 10 }}
          columns={[
            {
              title: "套餐",
              render: (_, row) => (
                <div>
                  <strong>{row.name}</strong>
                  <div className="secondary-line">{row.description}</div>
                </div>
              ),
            },
            {
              title: "售价",
              render: (_, row) =>
                `${row.currency} ${(row.priceMinor / 100).toFixed(2)}`,
            },
            {
              title: "额度",
              render: (_, row) =>
                row.unifiedQuota !== null
                  ? `${Number(row.unifiedQuota).toLocaleString()} 统一字符`
                  : `输入 ${Number(row.inputQuota ?? 0).toLocaleString()} / 输出 ${Number(row.outputQuota ?? 0).toLocaleString()}`,
            },
            {
              title: "有效期",
              render: (_, row) => `${row.validityDays} 天`,
            },
            {
              title: "适用模型",
              render: (_, row) => row.models.map((model) => model.displayName).join("、"),
            },
            {
              title: "状态",
              dataIndex: "status",
              render: (status) => (
                <Tag color={status === "ACTIVE" ? "green" : "default"}>
                  {status === "ACTIVE" ? "已上架" : status === "DRAFT" ? "草稿" : "已下架"}
                </Tag>
              ),
            },
            {
              title: "操作",
              render: (_, row) => (
                <Space>
                  <Button type="link" onClick={() => openPlan(row)}>
                    编辑
                  </Button>
                  <Button
                    type="link"
                    danger={row.status === "ACTIVE"}
                    onClick={() => changeStatus(row)}
                  >
                    {row.status === "ACTIVE" ? "下架" : "上架"}
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        title={editingPlan ? "编辑服务套餐" : "新增服务套餐"}
        open={open}
        width={680}
        okText={editingPlan ? "保存修改" : "创建套餐"}
        cancelText="取消"
        onCancel={() => {
          setOpen(false);
          setEditingPlan(null);
        }}
        onOk={() => form.submit()}
        forceRender
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            const payload = {
              ...values,
              priceMinor: Math.round(values.priceYuan * 100),
              priceYuan: undefined,
              inputQuota: null,
              outputQuota: null,
            };
            const save = async () => {
              try {
                if (editingPlan) {
                  await adminApi.updatePlan(editingPlan.id, payload);
                } else {
                  await adminApi.createPlan(payload);
                }
                setOpen(false);
                setEditingPlan(null);
                form.resetFields();
                message.success(editingPlan ? "套餐已更新" : "套餐已创建");
                await load();
              } catch (caught) {
                setError(caught as PlatformError);
              }
            };
            if (editingPlan) {
              modal.confirm({
                title: "确认修改套餐",
                content:
                  "价格、额度或适用模型变更会关闭生产模式，并写入审计日志。",
                okText: "确认修改",
                cancelText: "取消",
                onOk: save,
              });
            } else {
              await save();
            }
          }}
        >
          <Form.Item name="name" label="套餐名称" rules={[{ required: true }]}>
            <Input placeholder="例如：开发测试套餐" />
          </Form.Item>
          <Form.Item name="description" label="套餐说明" rules={[{ required: true }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Space size={12} style={{ display: "flex" }}>
            <Form.Item name="priceYuan" label="售价（元）" rules={[{ required: true }]}>
              <InputNumber min={0} precision={2} />
            </Form.Item>
            <Form.Item name="currency" label="币种">
              <Select options={[{ value: "CNY", label: "CNY" }]} />
            </Form.Item>
            <Form.Item name="unifiedQuota" label="统一字符额度" rules={[{ required: true }]}>
              <InputNumber min={1} precision={0} />
            </Form.Item>
          </Space>
          <Form.Item name="modelIds" label="适用模型" rules={[{ required: true }]}>
            <Select
              mode="multiple"
              options={models.map((model) => ({
                value: model.id,
                label: model.displayName,
              }))}
            />
          </Form.Item>
          <Space size={12} style={{ display: "flex" }}>
            <Form.Item name="activationMode" label="生效方式">
              <Select
                options={[
                  { value: "IMMEDIATE", label: "购买后立即生效" },
                  { value: "ON_FIRST_USE", label: "首次调用时生效" },
                ]}
              />
            </Form.Item>
            <Form.Item name="validityDays" label="有效期（天）">
              <InputNumber min={1} precision={0} />
            </Form.Item>
            <Form.Item name="status" label="初始状态">
              <Select
                options={[
                  { value: "DRAFT", label: "草稿" },
                  { value: "ACTIVE", label: "直接上架" },
                ]}
              />
            </Form.Item>
          </Space>
          <Form.Item name="refundPolicy" label="退款条件" rules={[{ required: true }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="purchaseNotice" label="购买前确认文案" rules={[{ required: true }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
