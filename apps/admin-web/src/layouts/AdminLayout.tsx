import {
  ApiOutlined,
  FileProtectOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ShoppingOutlined,
  TagsOutlined,
} from "@ant-design/icons";
import { Button, Layout, Menu, Typography } from "antd";
import { useEffect, useState } from "react";
import {
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { clearAdminToken, getAdminToken } from "../api/client";

const items = [
  { key: "/models", icon: <ApiOutlined />, label: "供应商与模型" },
  { key: "/plans", icon: <TagsOutlined />, label: "服务套餐" },
  { key: "/orders", icon: <ShoppingOutlined />, label: "订单与财务" },
  {
    key: "/compliance",
    icon: <FileProtectOutlined />,
    label: "合规配置",
  },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [authenticated, setAuthenticated] = useState(
    Boolean(getAdminToken()),
  );

  useEffect(() => {
    const expire = () => {
      setAuthenticated(false);
      navigate("/login", { replace: true });
    };
    window.addEventListener("admin-session-expired", expire);
    return () =>
      window.removeEventListener("admin-session-expired", expire);
  }, [navigate]);

  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }

  const logout = () => {
    clearAdminToken();
    setAuthenticated(false);
  };

  return (
    <Layout className="admin-shell">
      <Layout.Sider
        width={232}
        collapsedWidth={76}
        collapsible
        collapsed={collapsed}
        trigger={null}
        className="admin-sider"
      >
        <div className="console-brand">
          <div className="brand-dot">M</div>
          {!collapsed && (
            <div>
              <strong>模型网关</strong>
              <span>运营控制台</span>
            </div>
          )}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={items}
          onClick={({ key }) => navigate(key)}
        />
        <div className="sider-footer">
          <Button
            type="text"
            icon={<LogoutOutlined />}
            onClick={logout}
          >
            {!collapsed && "退出登录"}
          </Button>
        </div>
      </Layout.Sider>
      <Layout>
        <Layout.Header className="admin-header">
          <Button
            type="text"
            aria-label={collapsed ? "展开导航" : "收起导航"}
            icon={
              collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />
            }
            onClick={() => setCollapsed((value) => !value)}
          />
          <div className="header-status">
            <span className="status-dot" />
            <Typography.Text>本地服务已连接</Typography.Text>
          </div>
        </Layout.Header>
        <Layout.Content className="admin-content">
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
