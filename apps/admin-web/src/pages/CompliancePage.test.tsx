import { render, screen } from "@testing-library/react";
import { App as AntdApp } from "antd";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import { CompliancePage } from "./CompliancePage";
import { adminApi } from "../api/client";

vi.mock("../api/client", () => ({
  adminApi: {
    getComplianceProfile: vi.fn().mockResolvedValue(null),
  },
}));

describe("CompliancePage", () => {
  afterEach(() => {
    vi.mocked(adminApi.getComplianceProfile).mockResolvedValue(null);
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
