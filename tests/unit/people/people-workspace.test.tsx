import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PeopleWorkspace } from "@/components/people/people-workspace";
import type { PeopleDashboardDto } from "@/features/people/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

const dashboard: PeopleDashboardDto = {
  setupRequired: false,
  workspace: { id: "workspace-1", name: "Priority Demo", slug: "local" },
  operators: [
    {
      id: "operator-1",
      displayName: "Lena Park",
      email: "lena@example.test",
    },
  ],
  metrics: { total: 2, active: 2, located: 2, highAttention: 1 },
  people: [
    {
      id: "person-1",
      displayName: "Avery Chen",
      title: "Chief Research Officer",
      organization: "Northstar Labs",
      tier: "critical",
      status: "active",
      notes: "Synthetic executive profile.",
      identities: [
        {
          id: "identity-1",
          type: "work_email",
          displayValue: "avery@northstar.example",
          isPrimary: true,
          isActive: true,
        },
      ],
      location: {
        id: "location-1",
        label: "New York, NY",
        latitude: 40.7128,
        longitude: -74.006,
        precision: "city",
        isActive: true,
        effectiveFrom: "2026-08-01T12:00:00.000Z",
      },
      locationHistory: [
        {
          id: "location-1",
          label: "New York, NY",
          latitude: 40.7128,
          longitude: -74.006,
          precision: "city",
          isActive: true,
          effectiveFrom: "2026-08-01T12:00:00.000Z",
        },
      ],
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-18T12:00:00.000Z",
    },
    {
      id: "person-2",
      displayName: "Elias Morgan",
      organization: "Redstone Foundation",
      tier: "standard",
      status: "active",
      identities: [
        {
          id: "identity-2",
          type: "username",
          displayValue: "elias.morgan",
          isPrimary: true,
          isActive: true,
        },
      ],
      location: {
        id: "location-2",
        label: "Singapore",
        latitude: 1.3521,
        longitude: 103.8198,
        precision: "country",
        isActive: true,
        effectiveFrom: "2026-08-02T12:00:00.000Z",
      },
      locationHistory: [
        {
          id: "location-2",
          label: "Singapore",
          latitude: 1.3521,
          longitude: 103.8198,
          precision: "country",
          isActive: true,
          effectiveFrom: "2026-08-02T12:00:00.000Z",
        },
      ],
      createdAt: "2026-08-02T12:00:00.000Z",
      updatedAt: "2026-08-17T12:00:00.000Z",
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("People workspace", () => {
  it("filters the roster locally and opens a person dossier", async () => {
    const user = userEvent.setup();
    render(<PeopleWorkspace dashboard={dashboard} />);

    expect(screen.getByRole("heading", { name: "People" })).toBeInTheDocument();
    expect(screen.getByText("New York, NY")).toBeInTheDocument();
    expect(screen.getByText("Singapore")).toBeInTheDocument();

    await user.type(
      screen.getByRole("searchbox", { name: "Search people" }),
      "Singapore",
    );
    expect(screen.queryByText("Avery Chen")).not.toBeInTheDocument();
    expect(screen.getByText("Elias Morgan")).toBeInTheDocument();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox", { name: "Search people" }));
    await user.click(screen.getByRole("button", { name: "View Avery Chen" }));

    expect(
      screen.getByRole("complementary", {
        name: "Avery Chen person dossier",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Avery Chen" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Synthetic executive profile."),
    ).toBeInTheDocument();

    const detailHandle = screen.getByRole("separator", {
      name: "Resize person detail panel",
    });
    expect(detailHandle).toHaveAttribute("aria-valuenow", "410");
    fireEvent.keyDown(detailHandle, { key: "ArrowLeft" });
    expect(detailHandle).toHaveAttribute("aria-valuenow", "426");
    expect(
      detailHandle.parentElement?.style.getPropertyValue(
        "--home-detail-panel-width",
      ),
    ).toBe("426px");
  });

  it("opens create and manage flows from the roster", async () => {
    const user = userEvent.setup();
    render(<PeopleWorkspace dashboard={dashboard} />);

    await user.click(screen.getByRole("button", { name: "Add person" }));
    expect(
      screen.getByRole("complementary", { name: "Add person" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/shared person record used across every signal module/i),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Close person editor" }),
    );
    await user.click(screen.getByRole("button", { name: "View Avery Chen" }));
    await user.click(screen.getByRole("button", { name: "Manage" }));

    expect(
      screen.getByRole("navigation", {
        name: "Person management sections",
      }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Northstar Labs")).toBeInTheDocument();
  });
});
