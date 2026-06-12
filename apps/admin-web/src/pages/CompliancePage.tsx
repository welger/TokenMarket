import {
  App as AntdApp,
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Space,
  Spin,
  Switch,
  Typography,
} from "antd";
import { useEffect, useMemo, useState } from "react";

import {
  adminApi,
  type ComplianceProfile,
  type PlatformError,
} from "../api/client";

const requiredFields: Array<keyof ComplianceProfile> = [
  "operatorName",
  "customerServiceContact",
  "complaintChannel",
  "serverRegion",
  "logRetentionDays",
  "businessDataRetentionDays",
  "dataExportMethod",
  "dataDeletionMethod",
  "accountCancellationMethod",
  "privacyPolicyUrl",
  "termsOfServiceUrl",
  "contentSafetyRulesUrl",
];

export function CompliancePage() {
  const { message, modal } = AntdApp.useApp();
  const [form] = Form.useForm<ComplianceProfile>();
  const [profile, setProfile] = useState<ComplianceProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState<PlatformError | null>(null);

  useEffect(() => {
    adminApi
      .getComplianceProfile()
      .then((value) => {
        setProfile(value);
      })
      .catch((caught: PlatformError) => setError(caught))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading && profile) {
      form.setFieldsValue(profile);
    }
  }, [form, loading, profile]);

  const missingFields = useMemo(() => {
    if (!profile) {
      return requiredFields;
    }
    return requiredFields.filter((field) => {
      const value = profile[field];
      return (
        value === null ||
        value === undefined ||
        (typeof value === "string" && value.trim() === "")
      );
    });
  }, [profile]);
  const complete = missingFields.length === 0;

  const save = async (values: ComplianceProfile) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await adminApi.updateComplianceProfile(values);
      setProfile(updated);
      form.setFieldsValue(updated);
      message.success("合规资料已保存");
    } catch (caught) {
      setError(caught as PlatformError);
    } finally {
      setSaving(false);
    }
  };

  const enableProduction = async () => {
    setEnabling(true);
    setError(null);
    try {
      const updated = await adminApi.enableProduction();
      setProfile(updated);
      message.success("生产模式已启用");
    } catch (caught) {
      setError(caught as PlatformError);
    } finally {
      setEnabling(false);
    }
  };

  if (loading) {
    return <Spin description="读取合规资料" />;
  }

  return (
    <Space orientation="vertical" size={20} style={{ width: "100%" }}>
      <div>
        <Typography.Title level={2}>合规配置</Typography.Title>
        <Typography.Text type="secondary">
          维护小程序公开展示的经营、隐私和数据处理说明。
        </Typography.Text>
      </div>

      {!profile && (
        <Alert
          type="warning"
          showIcon
          title="经营主体未填写"
          description="请先补全经营主体、客服、数据保存和协议地址，完成后才能启用生产模式。"
        />
      )}
      {error && (
        <Alert
          type="error"
          showIcon
          title={error.message}
          description={
            error.requestId ? `请求 ID：${error.requestId}` : error.code
          }
        />
      )}

      <Card>
        <Row align="middle" justify="space-between" gutter={[16, 16]}>
          <Col>
            <Typography.Title level={4} style={{ margin: 0 }}>
              生产模式
            </Typography.Title>
            <Typography.Text type="secondary">
              {!complete
                ? `仍有 ${missingFields.length} 项必填资料待完善`
                : "资料完整，可由所有者确认启用"}
            </Typography.Text>
          </Col>
          <Col>
            <Switch
              aria-label="生产模式"
              checked={profile?.productionEnabled ?? false}
              disabled={!complete || profile?.productionEnabled === true}
              loading={enabling}
              onChange={(checked) => {
                if (checked) {
                  modal.confirm({
                    title: "启用生产模式",
                    content:
                      "请确认经营主体、客服、供应商披露和协议地址均为真实有效信息。该操作会写入审计日志。",
                    okText: "确认启用",
                    cancelText: "取消",
                    onOk: enableProduction,
                  });
                }
              }}
            />
          </Col>
        </Row>
      </Card>

      <Card title="经营与客服">
        <Form
          form={form}
          layout="vertical"
          onFinish={save}
          initialValues={{
            logRetentionDays: 30,
            businessDataRetentionDays: 365,
          }}
        >
          <Row gutter={20}>
            <Col xs={24} lg={12}>
              <Form.Item
                name="operatorName"
                label="经营主体"
                rules={[{ required: true, message: "请填写经营主体" }]}
              >
                <Input placeholder="上线前填写真实经营主体" />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item
                name="serverRegion"
                label="服务器地区"
                rules={[{ required: true, message: "请填写服务器地区" }]}
              >
                <Input placeholder="例如：中国大陆" />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item
                name="customerServiceContact"
                label="客服联系方式"
                rules={[{ required: true, message: "请填写客服联系方式" }]}
              >
                <Input placeholder="真实客服电话或在线客服说明" />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item
                name="complaintChannel"
                label="投诉渠道"
                rules={[{ required: true, message: "请填写投诉渠道" }]}
              >
                <Input placeholder="投诉电话、邮箱或在线入口" />
              </Form.Item>
            </Col>
          </Row>

          <Typography.Title level={5}>数据处理</Typography.Title>
          <Row gutter={20}>
            <Col xs={24} lg={12}>
              <Form.Item
                name="logRetentionDays"
                label="调用日志保存天数"
                rules={[{ required: true }]}
              >
                <InputNumber min={0} precision={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item
                name="businessDataRetentionDays"
                label="业务数据保存天数"
                rules={[{ required: true }]}
              >
                <InputNumber min={0} precision={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            {[
              ["dataExportMethod", "数据导出方式"],
              ["dataDeletionMethod", "数据删除方式"],
              ["accountCancellationMethod", "账户注销方式"],
            ].map(([name, label]) => (
              <Col xs={24} key={name}>
                <Form.Item
                  name={name}
                  label={label}
                  rules={[{ required: true, message: `请填写${label}` }]}
                >
                  <Input.TextArea rows={2} />
                </Form.Item>
              </Col>
            ))}
          </Row>

          <Typography.Title level={5}>公开协议地址</Typography.Title>
          {[
            ["privacyPolicyUrl", "隐私政策 URL"],
            ["termsOfServiceUrl", "用户协议 URL"],
            ["contentSafetyRulesUrl", "内容安全规则 URL"],
          ].map(([name, label]) => (
            <Form.Item
              key={name}
              name={name}
              label={label}
              rules={[
                { required: true, message: `请填写${label}` },
                { type: "url", message: "请输入有效的 HTTP(S) 地址" },
              ]}
            >
              <Input placeholder="https://" />
            </Form.Item>
          ))}

          <Button type="primary" htmlType="submit" loading={saving}>
            保存合规资料
          </Button>
        </Form>
      </Card>
    </Space>
  );
}
