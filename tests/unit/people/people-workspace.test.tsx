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
  metrics: {
    total: 2,
    active: 2,
    traveling: 0,
    located: 2,
    highAttention: 1,
  },
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
    expect(screen.getAllByText("New York, NY").length).toBeGreaterThan(0);
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

  it("shows confirmed travel without replacing the approved location", async () => {
    const user = userEvent.setup();
    const travelDashboard: PeopleDashboardDto = {
      ...dashboard,
      metrics: { ...dashboard.metrics, traveling: 1 },
      people: [
        {
          ...dashboard.people[0],
          activeTravel: {
            assignmentId: "assignment-1",
            flightInstanceId: "flight-1",
            passengerFlightNumber: "UA2276",
            adsbCallsign: "UAL2276",
            origin: {
              iata: "IAD",
              name: "Washington Dulles International Airport",
              latitude: 38.9445,
              longitude: -77.4558,
            },
            destination: {
              iata: "LAX",
              name: "Los Angeles International Airport",
              latitude: 33.9425,
              longitude: -118.408,
            },
            scheduledDepartureAt: "2026-09-02T18:00:00.000Z",
            scheduledArrivalAt: "2026-09-02T23:30:00.000Z",
            aircraft: { icaoHex: "aa3ae5", registration: "N00000" },
            position: {
              latitude: 39.1,
              longitude: -78.2,
              groundSpeedKnots: 310,
              trackDegrees: 270,
              onGround: false,
              observedAt: "2026-09-02T18:05:00.000Z",
              retrievedAt: "2026-09-02T18:05:01.000Z",
              isStale: false,
            },
          },
        },
        dashboard.people[1],
      ],
    };

    render(<PeopleWorkspace dashboard={travelDashboard} />);

    expect(screen.getByText("UA2276 · IAD → LAX")).toBeInTheDocument();
    expect(
      screen.getByText("Inferred from confirmed aircraft"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View Avery Chen" }));

    expect(
      screen.getByRole("heading", { name: "Active travel mode" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Travel mode does not overwrite/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText("New York, NY").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: "Open flight dossier →" }),
    ).toHaveAttribute("href", "/flightsignal?flight=flight-1");
  });
});
