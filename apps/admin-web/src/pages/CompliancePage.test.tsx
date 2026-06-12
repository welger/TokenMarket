import { render, screen } from "@testing-library/react";
import { App as AntdApp } from "antd";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import { CompliancePage } from "./CompliancePage";

vi.mock("../api/client", () => ({
  adminApi: {
    getComplianceProfile: vi.fn().mockResolvedValue(null),
  },
}));

describe("CompliancePage", () => {
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
});
