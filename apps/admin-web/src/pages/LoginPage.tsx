import {
  LockOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Alert, Button, Form, Input, Typography } from "antd";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import {
  adminApi,
  getAdminToken,
  setAdminToken,
  type PlatformError,
} from "../api/client";

export function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PlatformError | null>(null);

  if (getAdminToken()) {
    return <Navigate to="/models" replace />;
  }

  const login = async (values: {
    username: string;
    password: string;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.login(
        values.username,
        values.password,
      );
      setAdminToken(result.accessToken);
      navigate("/models", { replace: true });
    } catch (caught) {
      setError(caught as PlatformError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-shell">
      <section className="login-brand">
        <div className="brand-mark">
          <SafetyCertificateOutlined />
        </div>
        <Typography.Title>模型网关</Typography.Title>
        <Typography.Paragraph>
          多模型 API 服务运营控制台
        </Typography.Paragraph>
        <div className="trust-note">
          管理员入口与小程序用户体系隔离，所有敏感操作均写入审计日志。
        </div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <Typography.Title level={2}>管理员登录</Typography.Title>
          <Typography.Paragraph type="secondary">
            使用后台管理员账户继续
          </Typography.Paragraph>
          {error && (
            <Alert
              type="error"
              showIcon
              title="登录失败"
              description={
                error.requestId
                  ? `${error.message} · 请求 ID：${error.requestId}`
                  : error.message
              }
            />
          )}
          <Form layout="vertical" onFinish={login} requiredMark={false}>
            <Form.Item
              name="username"
              label="用户名"
              rules={[{ required: true, message: "请输入用户名" }]}
            >
              <Input
                size="large"
                prefix={<UserOutlined />}
                autoComplete="username"
              />
            </Form.Item>
            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, message: "请输入密码" }]}
            >
              <Input.Password
                size="large"
                prefix={<LockOutlined />}
                autoComplete="current-password"
              />
            </Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={loading}
            >
              登录控制台
            </Button>
          </Form>
        </div>
      </section>
    </main>
  );
}
