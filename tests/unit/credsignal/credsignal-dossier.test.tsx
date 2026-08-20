import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CredSignalDossier } from "@/components/credsignal/credsignal-dossier";
import type { CredSignalProtecteeDto } from "@/features/credsignal/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const protectee: CredSignalProtecteeDto = {
  id: "30000000-0000-4000-8000-000000000001",
  displayName: "Avery Chen",
  title: "Chief Research Officer",
  organization: "Northstar Labs",
  tier: "critical",
  status: "active",
  identities: [],
  credentials: [
    {
      id: "d0000000-0000-4000-8000-000000000001",
      protecteeId: "30000000-0000-4000-8000-000000000001",
      protecteeName: "Avery Chen",
      accountIdentifier: "avery.chen@northstar.example",
      service: "Northstar Identity",
      serviceDomain: "id.northstar.example",
      credentialKind: "password",
      status: "active",
      exposurePosture: "in_response",
      exposures: [],
      versions: [],
      openCaseCount: 1,
      updatedAt: "2026-08-18T12:00:00.000Z",
    },
  ],
  exposures: [],
  cases: [],
  openCaseCount: 1,
  openTaskCount: 2,
  locationHistory: [],
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-18T12:00:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CredSignal person dossier", () => {
  it("opens a managed credential from the person overview", async () => {
    const user = userEvent.setup();
    const onSelectCredential = vi.fn();

    render(
      <CredSignalDossier
        activeOperatorId="operator-1"
        onClose={vi.fn()}
        onManage={vi.fn()}
        onSelectCredential={onSelectCredential}
        onTabChange={vi.fn()}
        operators={[]}
        protectee={protectee}
        tab="overview"
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Open Northstar Identity credential for Avery Chen",
      }),
    );

    expect(onSelectCredential).toHaveBeenCalledWith(
      "d0000000-0000-4000-8000-000000000001",
    );
  });
});
