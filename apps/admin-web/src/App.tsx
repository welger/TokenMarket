import { App as AntdApp, ConfigProvider, Spin } from "antd";
import zhCN from "antd/locale/zh_CN";
import { Suspense, lazy } from "react";
import {
  Navigate,
  RouterProvider,
  createBrowserRouter,
} from "react-router-dom";

import { AdminLayout } from "./layouts/AdminLayout";
import { LoginPage } from "./pages/LoginPage";

const ModelsPage = lazy(() =>
  import("./pages/ModelsPage").then((module) => ({
    default: module.ModelsPage,
  })),
);
const PlansPage = lazy(() =>
  import("./pages/PlansPage").then((module) => ({
    default: module.PlansPage,
  })),
);
const OrdersPage = lazy(() =>
  import("./pages/OrdersPage").then((module) => ({
    default: module.OrdersPage,
  })),
);
const CompliancePage = lazy(() =>
  import("./pages/CompliancePage").then((module) => ({
    default: module.CompliancePage,
  })),
);

function DeferredPage({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="page-loading">
          <Spin description="加载页面" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <AdminLayout />,
    children: [
      {
        path: "/models",
        element: (
          <DeferredPage>
            <ModelsPage />
          </DeferredPage>
        ),
      },
      {
        path: "/plans",
        element: (
          <DeferredPage>
            <PlansPage />
          </DeferredPage>
        ),
      },
      {
        path: "/orders",
        element: (
          <DeferredPage>
            <OrdersPage />
          </DeferredPage>
        ),
      },
      {
        path: "/compliance",
        element: (
          <DeferredPage>
            <CompliancePage />
          </DeferredPage>
        ),
      },
    ],
  },
  { path: "*", element: <Navigate to="/models" replace /> },
]);

export function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#07c160",
          colorInfo: "#07c160",
          colorSuccess: "#07c160",
          borderRadius: 8,
          colorBgLayout: "#f5f7f6",
          colorText: "#172033",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
        },
        components: {
          Layout: {
            headerBg: "#ffffff",
            siderBg: "#15231d",
          },
          Menu: {
            darkItemBg: "#15231d",
            darkItemSelectedBg: "#0b6b3a",
            itemSelectedBg: "#e8f8ef",
            itemSelectedColor: "#087d42",
          },
        },
      }}
    >
      <AntdApp>
        <RouterProvider router={router} />
      </AntdApp>
    </ConfigProvider>
  );
}
