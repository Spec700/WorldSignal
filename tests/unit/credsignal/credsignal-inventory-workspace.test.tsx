import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  credentialKind: "session_cookie" as const,
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
  openCaseCount: 1,
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
      cases: [
        {
          id: "c0000000-0000-4000-8000-000000000001",
          title: "Active Northstar session exposed",
          status: "remediating",
          priority: "critical",
          assigneeId: "operator-1",
          assigneeName: "Lena Park",
          dueAt: "2026-08-20T16:00:00.000Z",
          openedAt: "2026-08-18T12:00:00.000Z",
          exposureIds: [],
          tasks: [
            {
              id: "f0000000-0000-4000-8000-000000000001",
              type: "revoke_sessions",
              title: "Revoke active Northstar sessions",
              status: "in_progress",
              assigneeId: "operator-1",
              assigneeName: "Lena Park",
              dueAt: "2026-08-20T15:00:00.000Z",
            },
          ],
          communications: [],
        },
      ],
      activePriority: "critical",
      openCaseCount: 1,
      openTaskCount: 1,
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
    openCases: 1,
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
  it("resizes the case activity strip with the keyboard", () => {
    render(<CredSignalInventoryWorkspace dashboard={dashboard} />);

    const handle = screen.getByRole("separator", {
      name: "Resize case activity",
    });

    expect(handle).toHaveAttribute("aria-valuenow", "116");
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(handle).toHaveAttribute("aria-valuenow", "132");
    expect(
      handle.parentElement?.style.getPropertyValue("--activity-strip-height"),
    ).toBe("132px");
  });

  it("filters people and drills from a person into credential management", async () => {
    const user = userEvent.setup();
    render(<CredSignalInventoryWorkspace dashboard={dashboard} />);

    expect(
      screen.getByRole("heading", { name: "People credential operations" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Northstar Labs")).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox"), "not-present");
    expect(screen.getByText("No people match this view")).toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "session cookie");
    expect(screen.getByText("Northstar Labs")).toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox"));
    const tableRowCount = screen.getAllByRole("row").length;
    await user.click(
      screen.getByRole("button", {
        name: "Open credential operations for Avery Chen",
      }),
    );

    expect(
      screen.getByRole("complementary", {
        name: "Avery Chen credential dossier",
      }),
    ).toBeInTheDocument();
    const detailHandle = screen.getByRole("separator", {
      name: "Resize credential detail panel",
    });
    expect(detailHandle).toHaveAttribute("aria-valuenow", "420");
    fireEvent.keyDown(detailHandle, { key: "ArrowLeft" });
    expect(detailHandle).toHaveAttribute("aria-valuenow", "436");
    expect(
      detailHandle.parentElement?.style.getPropertyValue(
        "--detail-panel-width",
      ),
    ).toBe("436px");
    expect(screen.getAllByRole("row")).toHaveLength(tableRowCount);
    expect(
      screen.getByRole("button", { name: /Avery Chen/i, pressed: true }),
    ).toBeInTheDocument();

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

    await user.click(screen.getByRole("button", { name: "Back to person" }));
    expect(
      screen.getByRole("complementary", {
        name: "Avery Chen credential dossier",
      }),
    ).toBeInTheDocument();
  });

  it("opens a case queue item in the person dossier", async () => {
    const user = userEvent.setup();
    render(<CredSignalInventoryWorkspace dashboard={dashboard} />);

    await user.click(screen.getByRole("tab", { name: "Unmatched 0" }));
    expect(screen.getByText("Identity queue clear")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Open cases 1" }));
    await user.click(
      screen.getByRole("button", { name: "Open case for Avery Chen" }),
    );

    expect(screen.getByRole("tab", { name: "People 1" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("complementary", {
        name: "Avery Chen credential dossier",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Response checklist")).toBeInTheDocument();
    expect(screen.getByText("Victim coordination")).toBeInTheDocument();
  });

  it("keeps credential creation available from the people workspace", async () => {
    const user = userEvent.setup();
    render(<CredSignalInventoryWorkspace dashboard={dashboard} />);

    await user.click(screen.getByRole("button", { name: "Add credential" }));

    expect(
      screen.getByRole("complementary", { name: "Add managed credential" }),
    ).toBeInTheDocument();
  });
});
