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
  Tabs,
  Tag,
  Typography,
} from "antd";
import { useCallback, useEffect, useState } from "react";

import {
  adminApi,
  type ModelRecord,
  type PlatformError,
  type ProviderRecord,
} from "../api/client";
import { PlatformErrorAlert } from "../components/PlatformErrorAlert";

export function ModelsPage() {
  const { message, modal } = AntdApp.useApp();
  const [providers, setProviders] = useState<ProviderRecord[]>([]);
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<PlatformError | null>(null);
  const [providerOpen, setProviderOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [editingProvider, setEditingProvider] =
    useState<ProviderRecord | null>(null);
  const [editingModel, setEditingModel] =
    useState<ModelRecord | null>(null);
  const [providerForm] = Form.useForm();
  const [modelForm] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [providerRows, modelRows] = await Promise.all([
        adminApi.listProviders(),
        adminApi.listModels(),
      ]);
      setProviders(providerRows);
      setModels(modelRows);
    } catch (caught) {
      setError(caught as PlatformError);
    } finally {
      setLoading(false);
    }
  }, []);

  const sortedProviders = [...providers].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() -
      new Date(left.updatedAt).getTime(),
  );
  const sortedModels = [...models].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() -
      new Date(left.updatedAt).getTime(),
  );

  const openProvider = (provider?: ProviderRecord) => {
    setEditingProvider(provider ?? null);
    providerForm.resetFields();
    providerForm.setFieldsValue(
      provider ?? { status: "ACTIVE", routingPriority: 100 },
    );
    setProviderOpen(true);
  };

  const openModel = (model?: ModelRecord) => {
    setEditingModel(model ?? null);
    modelForm.resetFields();
    modelForm.setFieldsValue(
      model
        ? {
            ...model,
            providerId: model.providerId,
          }
        : {
            capabilities: [],
            contextWindow: 8192,
            inputMultiplier: 1,
            outputMultiplier: 1,
            routingPriority: 100,
            status: "UNAVAILABLE",
          },
    );
    setModelOpen(true);
  };

  useEffect(() => {
    void load();
  }, [load]);

  const confirmStatus = (
    kind: "provider" | "model",
    record: ProviderRecord | ModelRecord,
  ) => {
    const active =
      kind === "provider"
        ? record.status === "ACTIVE"
        : record.status === "AVAILABLE";
    modal.confirm({
      title: `${active ? "停用" : "启用"}${
        kind === "provider" ? "供应商" : "模型"
      }`,
      content:
        "状态变更会自动关闭生产模式，需要重新完成上线检查。",
      okText: "确认变更",
      cancelText: "取消",
      okButtonProps: { danger: active },
      onOk: async () => {
        try {
          if (kind === "provider") {
            await adminApi.updateProvider(record.id, {
              status: active ? "INACTIVE" : "ACTIVE",
            });
          } else {
            await adminApi.updateModel(record.id, {
              status: active ? "UNAVAILABLE" : "AVAILABLE",
            });
          }
          message.success("状态已更新");
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
          <Typography.Title level={2}>供应商与模型</Typography.Title>
          <Typography.Text type="secondary">
            维护上游配置引用、模型映射、计量倍率和服务状态。
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
              key: "models",
              label: `模型 ${models.length}`,
              children: (
                <>
                  <div className="table-toolbar">
                    <Typography.Text type="secondary">
                      公开模型名会映射到供应商的上游模型名。
                    </Typography.Text>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => openModel()}
                    >
                      新增模型
                    </Button>
                  </div>
                  <Table
                    rowKey="id"
                    loading={loading}
                    dataSource={sortedModels}
                    pagination={{ pageSize: 10 }}
                    columns={[
                      {
                        title: "模型",
                        render: (_, row) => (
                          <div>
                            <strong>{row.displayName}</strong>
                            <div className="secondary-line">{row.name}</div>
                          </div>
                        ),
                      },
                      {
                        title: "供应商",
                        render: (_, row) => row.provider.displayName,
                      },
                      {
                        title: "上下文",
                        dataIndex: "contextWindow",
                        render: (value) => Number(value).toLocaleString(),
                      },
                      {
                        title: "扣减倍率",
                        render: (_, row) =>
                          `输入 ${row.inputMultiplier} / 输出 ${row.outputMultiplier}`,
                      },
                      {
                        title: "状态",
                        dataIndex: "status",
                        render: (status) => (
                          <Tag color={status === "AVAILABLE" ? "green" : "default"}>
                            {status === "AVAILABLE" ? "可用" : "停用"}
                          </Tag>
                        ),
                      },
                      {
                        title: "操作",
                        render: (_, row) => (
                          <Space>
                            <Button type="link" onClick={() => openModel(row)}>
                              编辑
                            </Button>
                            <Button
                              type="link"
                              danger={row.status === "AVAILABLE"}
                              onClick={() => confirmStatus("model", row)}
                            >
                              {row.status === "AVAILABLE" ? "停用" : "启用"}
                            </Button>
                          </Space>
                        ),
                      },
                    ]}
                  />
                </>
              ),
            },
            {
              key: "providers",
              label: `供应商 ${providers.length}`,
              children: (
                <>
                  <div className="table-toolbar">
                    <Typography.Text type="secondary">
                      只保存环境变量引用，不在后台录入供应商密钥。
                    </Typography.Text>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => openProvider()}
                    >
                      新增供应商
                    </Button>
                  </div>
                  <Table
                    rowKey="id"
                    loading={loading}
                    dataSource={sortedProviders}
                    columns={[
                      {
                        title: "供应商",
                        render: (_, row) => (
                          <div>
                            <strong>{row.displayName}</strong>
                            <div className="secondary-line">{row.name}</div>
                          </div>
                        ),
                      },
                      { title: "配置引用", dataIndex: "configRef" },
                      { title: "服务器地区", dataIndex: "region" },
                      {
                        title: "优先级",
                        dataIndex: "routingPriority",
                      },
                      {
                        title: "状态",
                        dataIndex: "status",
                        render: (status) => (
                          <Tag color={status === "ACTIVE" ? "green" : "default"}>
                            {status === "ACTIVE" ? "运行中" : "已停用"}
                          </Tag>
                        ),
                      },
                      {
                        title: "操作",
                        render: (_, row) => (
                          <Space>
                            <Button
                              type="link"
                              onClick={() => openProvider(row)}
                            >
                              编辑
                            </Button>
                            <Button
                              type="link"
                              danger={row.status === "ACTIVE"}
                              onClick={() => confirmStatus("provider", row)}
                            >
                              {row.status === "ACTIVE" ? "停用" : "启用"}
                            </Button>
                          </Space>
                        ),
                      },
                    ]}
                  />
                </>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={editingProvider ? "编辑供应商" : "新增供应商"}
        open={providerOpen}
        okText={editingProvider ? "保存修改" : "创建供应商"}
        cancelText="取消"
        onCancel={() => {
          setProviderOpen(false);
          setEditingProvider(null);
        }}
        onOk={() => providerForm.submit()}
        forceRender
      >
        <Form
          form={providerForm}
          layout="vertical"
          onFinish={async (values) => {
            const save = async () => {
              try {
                if (editingProvider) {
                  await adminApi.updateProvider(editingProvider.id, values);
                } else {
                  await adminApi.createProvider(values);
                }
                setProviderOpen(false);
                setEditingProvider(null);
                providerForm.resetFields();
                message.success(
                  editingProvider ? "供应商已更新" : "供应商已创建",
                );
                await load();
              } catch (caught) {
                setError(caught as PlatformError);
              }
            };
            if (editingProvider) {
              modal.confirm({
                title: "确认修改供应商",
                content:
                  "供应商配置变更会关闭生产模式，需要重新完成上线检查。",
                okText: "确认修改",
                cancelText: "取消",
                onOk: save,
              });
            } else {
              await save();
            }
          }}
        >
          <Form.Item name="displayName" label="展示名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name" label="内部名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="configRef"
            label="环境变量引用"
            rules={[{ required: true }]}
          >
            <Input placeholder="env:PROVIDER_CONFIG" />
          </Form.Item>
          <Form.Item
            name="disclosurePurpose"
            label="公开用途说明"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="region" label="服务器地区" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="routingPriority" label="路由优先级">
            <InputNumber min={0} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { value: "ACTIVE", label: "运行中" },
                { value: "INACTIVE", label: "停用" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingModel ? "编辑模型" : "新增模型"}
        open={modelOpen}
        okText={editingModel ? "保存修改" : "创建模型"}
        cancelText="取消"
        onCancel={() => {
          setModelOpen(false);
          setEditingModel(null);
        }}
        onOk={() => modelForm.submit()}
        forceRender
      >
        <Form
          form={modelForm}
          layout="vertical"
          onFinish={async (values) => {
            const save = async () => {
              try {
                if (editingModel) {
                  await adminApi.updateModel(editingModel.id, values);
                } else {
                  await adminApi.createModel(values);
                }
                setModelOpen(false);
                setEditingModel(null);
                modelForm.resetFields();
                message.success(editingModel ? "模型已更新" : "模型已创建");
                await load();
              } catch (caught) {
                setError(caught as PlatformError);
              }
            };
            if (editingModel) {
              modal.confirm({
                title: "确认修改模型",
                content:
                  "模型映射、计量倍率或状态变更会关闭生产模式。",
                okText: "确认修改",
                cancelText: "取消",
                onOk: save,
              });
            } else {
              await save();
            }
          }}
        >
          <Form.Item name="providerId" label="供应商" rules={[{ required: true }]}>
            <Select
              options={providers.map((provider) => ({
                value: provider.id,
                label: provider.displayName,
              }))}
            />
          </Form.Item>
          <Form.Item name="displayName" label="展示名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name" label="平台模型名" rules={[{ required: true }]}>
            <Input placeholder="model-name" />
          </Form.Item>
          <Form.Item name="upstreamModel" label="上游模型名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="模型说明" rules={[{ required: true }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="capabilities" label="能力标签">
            <Select mode="tags" tokenSeparators={[","]} />
          </Form.Item>
          <Space size={12} style={{ display: "flex" }}>
            <Form.Item name="contextWindow" label="上下文窗口">
              <InputNumber min={1} precision={0} />
            </Form.Item>
            <Form.Item name="inputMultiplier" label="输入倍率">
              <InputNumber min={0} step={0.1} />
            </Form.Item>
            <Form.Item name="outputMultiplier" label="输出倍率">
              <InputNumber min={0} step={0.1} />
            </Form.Item>
          </Space>
          <Form.Item name="routingPriority" label="路由优先级">
            <InputNumber min={0} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="status" label="初始状态">
            <Select
              options={[
                { value: "UNAVAILABLE", label: "停用" },
                { value: "AVAILABLE", label: "可用" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
