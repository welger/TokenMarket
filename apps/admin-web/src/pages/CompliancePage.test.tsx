import { render, screen } from "@testing-library/react";
import { App as AntdApp } from "antd";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import { CompliancePage } from "./CompliancePage";
import { adminApi } from "../api/client";

const { readinessFixture } = vi.hoisted(() => ({
  readinessFixture: {
    status: "FAIL" as const,
    generatedAt: "2026-06-13T00:00:00.000Z",
    summary: { pass: 1, warn: 1, fail: 1 },
    checks: [
      {
        id: "compliance.operator",
        label: "经营主体",
        status: "FAIL" as const,
        message: "请填写真实经营主体",
      },
      {
        id: "runtime.trustedProxy",
        label: "可信代理",
        status: "WARN" as const,
        message: "如生产环境位于反向代理后，请配置真实代理 CIDR",
      },
      {
        id: "safety.contentRules",
        label: "内容安全规则",
        status: "PASS" as const,
        message: "至少一条内容安全规则已启用",
      },
    ],
  },
}));

vi.mock("../api/client", () => ({
  adminApi: {
    getComplianceProfile: vi.fn().mockResolvedValue(null),
    getProductionReadiness: vi.fn().mockResolvedValue(readinessFixture),
  },
}));

describe("CompliancePage", () => {
  beforeEach(() => {
    vi.mocked(adminApi.getComplianceProfile).mockResolvedValue(null);
    vi.mocked(adminApi.getProductionReadiness).mockResolvedValue(
      readinessFixture,
    );
  });

  it("shows missing required disclosures and disables production switch", async () => {
    render(
      <MemoryRouter>
        <AntdApp>
          <CompliancePage />
        </AntdApp>
      </MemoryRouter>,
    );

    expect(await screen.findByText("经营主体未填写")).toBeVisible();
    expect(
      screen.getByRole("switch", { name: "生产模式" }),
    ).toBeDisabled();
  });

  it("shows production readiness checks", async () => {
    render(
      <MemoryRouter>
        <AntdApp>
          <CompliancePage />
        </AntdApp>
      </MemoryRouter>,
    );

    expect(await screen.findByText("上线检查")).toBeVisible();
    expect(screen.getByText("阻塞 1 项")).toBeVisible();
    expect(screen.getByText("可信代理")).toBeVisible();
    expect(
      screen.getByText("如生产环境位于反向代理后，请配置真实代理 CIDR"),
    ).toBeVisible();
  });

  it("loads an existing profile without using a disconnected form", async () => {
    vi.mocked(adminApi.getComplianceProfile).mockResolvedValue({
      operatorName: "本地测试经营主体",
      customerServiceContact: "本地测试客服",
      complaintChannel: "本地测试投诉入口",
      serverRegion: "本地测试环境",
      logRetentionDays: 30,
      businessDataRetentionDays: 365,
      dataExportMethod: "本地导出",
      dataDeletionMethod: "本地删除",
      accountCancellationMethod: "本地注销",
      privacyPolicyUrl: "https://example.invalid/privacy",
      termsOfServiceUrl: "https://example.invalid/terms",
      contentSafetyRulesUrl: "https://example.invalid/safety",
      productionEnabled: false,
      updatedAt: "2026-06-12T00:00:00.000Z",
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    render(
      <MemoryRouter>
        <AntdApp>
          <CompliancePage />
        </AntdApp>
      </MemoryRouter>,
    );

    expect(
      await screen.findByDisplayValue("本地测试经营主体"),
    ).toBeVisible();
    expect(
      consoleError.mock.calls
        .flat()
        .some((value) =>
          String(value).includes(
            "Instance created by `useForm` is not connected",
          ),
        ),
    ).toBe(false);
    consoleError.mockRestore();
  });
});
