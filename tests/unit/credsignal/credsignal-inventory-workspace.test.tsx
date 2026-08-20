import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CredSignalInventoryWorkspace } from "@/components/credsignal/credsignal-inventory-workspace";
import type { CredSignalDashboardDto } from "@/features/credsignal/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

const credential = {
  id: "d0000000-0000-4000-8000-000000000001",
  protecteeId: "30000000-0000-4000-8000-000000000001",
  protecteeName: "Avery Chen",
  identityId: "40000000-0000-4000-8000-000000000001",
  accountIdentifier: "avery.chen@northstar.example",
  service: "Northstar Identity",
  serviceDomain: "id.northstar.example",
  credentialKind: "password" as const,
  status: "active" as const,
  exposurePosture: "no_known_exposure" as const,
  exposures: [],
  versions: [
    {
      id: "e0000000-0000-4000-8000-000000000001",
      version: 1,
      status: "active" as const,
      hasCredentialValue: true,
      activatedAt: "2026-08-18T12:00:00.000Z",
    },
  ],
  currentVersion: {
    id: "e0000000-0000-4000-8000-000000000001",
    version: 1,
    status: "active" as const,
    hasCredentialValue: true,
    activatedAt: "2026-08-18T12:00:00.000Z",
  },
  openCaseCount: 0,
  notes: "Synthetic managed credential.",
  updatedAt: "2026-08-18T12:00:00.000Z",
};

const dashboard: CredSignalDashboardDto = {
  setupRequired: false,
  workspace: { id: "workspace-1", name: "Priority Demo", slug: "local" },
  operators: [
    {
      id: "operator-1",
      displayName: "Lena Park",
      email: "lena@example.test",
    },
  ],
  credentials: [credential],
  protectees: [
    {
      id: credential.protecteeId,
      displayName: credential.protecteeName,
      title: "Chief Research Officer",
      organization: "Northstar Labs",
      tier: "critical",
      status: "active",
      identities: [
        {
          id: credential.identityId,
          type: "work_email",
          displayValue: credential.accountIdentifier,
          isPrimary: true,
          isActive: true,
        },
      ],
      credentials: [credential],
      exposures: [],
      cases: [],
      openCaseCount: 0,
      openTaskCount: 0,
      locationHistory: [],
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-18T12:00:00.000Z",
    },
  ],
  unmatchedExposures: [],
  recentActivity: [],
  metrics: {
    protectees: 1,
    credentials: 1,
    exposedCredentials: 0,
    openCases: 0,
    criticalProtectees: 0,
    overdueTasks: 0,
    unmatchedExposures: 0,
  },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CredSignal inventory workspace", () => {
  it("filters the inventory and opens the credential record", async () => {
    const user = userEvent.setup();
    render(<CredSignalInventoryWorkspace dashboard={dashboard} />);

    expect(
      screen.getByRole("heading", { name: "Managed credential inventory" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Northstar Identity")).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox"), "not-present");
    expect(
      screen.getByText("No credentials match this view"),
    ).toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox"));
    await user.click(
      screen.getByRole("button", {
        name: "Open Northstar Identity credential for Avery Chen",
      }),
    );

    expect(
      screen.getByRole("complementary", {
        name: "Credential record for avery.chen@northstar.example",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Synthetic managed credential."),
    ).toBeInTheDocument();
    expect(screen.getByText("••••••••••••••••")).toBeInTheDocument();
  });

  it("opens credential creation and preserves the operational queues", async () => {
    const user = userEvent.setup();
    render(<CredSignalInventoryWorkspace dashboard={dashboard} />);

    await user.click(screen.getByRole("button", { name: "Add credential" }));
    expect(
      screen.getByRole("complementary", { name: "Add managed credential" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Close add credential" }),
    );
    await user.click(screen.getByRole("tab", { name: "Unmatched 0" }));
    expect(screen.getByText("Identity queue clear")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Open cases 0" }));
    expect(screen.getByText("No open cases match")).toBeInTheDocument();
  });
});
