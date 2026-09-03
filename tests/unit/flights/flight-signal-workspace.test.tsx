import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FlightSignalWorkspace } from "@/components/flightsignal/flight-signal-workspace";
import { TrackFlightEditor } from "@/components/flightsignal/track-flight-editor";
import type { FlightSignalDashboardDto } from "@/features/flights/types";

const actionMocks = vi.hoisted(() => ({
  createTrackedFlightAction: vi.fn(async () => ({
    status: "success" as const,
    message: "Flight assigned.",
    flightInstanceId: "flight-2",
  })),
  lookupFlightRouteAction: vi.fn(async () => ({
    status: "success" as const,
    confirmationToken: "signed-flight-confirmation",
    flight: {
      passengerFlightNumber: "UA2276",
      flightIcao: "UAL2276",
      origin: {
        name: "Washington Dulles International Airport",
        icao: "KIAD",
        iata: "IAD",
        city: "Washington",
        country: "United States",
        latitude: 38.9445,
        longitude: -77.4558,
      },
      destination: {
        name: "Los Angeles International Airport",
        icao: "KLAX",
        iata: "LAX",
        city: "Los Angeles",
        country: "United States",
        latitude: 33.9425,
        longitude: -118.408,
      },
      scheduledDepartureAt: "2026-09-02T18:00:00.000Z",
      scheduledArrivalAt: "2026-09-02T23:30:00.000Z",
      providerStatus: "scheduled",
      phase: "scheduled" as const,
      retrievedAt: "2026-09-02T16:00:00.000Z",
    },
  })),
}));

vi.mock("@/app/flightsignal/actions", () => ({
  cancelFlightAssignmentAction: vi.fn(),
  completeTravelerFlightAction: vi.fn(),
  confirmTravelerOnboardAction: vi.fn(),
  createTrackedFlightAction: actionMocks.createTrackedFlightAction,
  lookupFlightRouteAction: actionMocks.lookupFlightRouteAction,
  refreshTrackedFlightAction: vi.fn(),
}));

const router = {
  refresh: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
};

vi.mock("next/navigation", () => ({ useRouter: () => router }));

vi.mock("next/dynamic", () => ({
  default: () =>
    function MockFlightGlobe({ flight }: { flight?: { id: string } }) {
      return <div data-testid="flight-globe">{flight?.id ?? "empty"}</div>;
    },
}));

class TestResizeObserver {
  readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe() {
    this.callback([], this as unknown as ResizeObserver);
  }

  unobserve() {}

  disconnect() {}
}

const dashboard: FlightSignalDashboardDto = {
  setupRequired: false,
  generatedAt: "2026-09-02T18:00:00.000Z",
  workspace: { id: "workspace-1", name: "Priority Demo", slug: "local" },
  operators: [
    {
      id: "operator-1",
      displayName: "Lena Park",
      email: "lena@example.test",
    },
  ],
  people: [
    {
      id: "30000000-0000-4000-8000-000000000006",
      displayName: "Amara Okafor",
      organization: "Kestrel Health",
      tier: "high",
      status: "active",
    },
  ],
  flights: [
    {
      id: "flight-1",
      passengerFlightNumber: "UA2276",
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
      trackingStatus: "tracking",
      displayStatus: "live_airborne",
      consecutiveSourceErrors: 0,
      aircraftIcaoHex: "aa3ae5",
      assignments: [
        {
          id: "assignment-1",
          person: {
            id: "30000000-0000-4000-8000-000000000006",
            displayName: "Amara Okafor",
            organization: "Kestrel Health",
            tier: "high",
            status: "active",
          },
          status: "onboard_confirmed",
          assignedAt: "2026-09-02T16:00:00.000Z",
          onboardConfirmedAt: "2026-09-02T17:55:00.000Z",
        },
      ],
      latestObservation: {
        id: "observation-1",
        aircraftIcaoHex: "aa3ae5",
        callsign: "UAL2276",
        latitude: 39.1,
        longitude: -78.2,
        groundSpeedKnots: 310,
        trackDegrees: 270,
        onGround: false,
        sourceObservedAt: "2026-09-02T17:59:30.000Z",
        retrievedAt: "2026-09-02T17:59:31.000Z",
      },
      candidateAircraft: [],
      trail: [],
      createdAt: "2026-09-02T16:00:00.000Z",
      updatedAt: "2026-09-02T17:59:31.000Z",
    },
  ],
  metrics: { tracked: 1, activeTravelers: 1, attention: 0, sourceErrors: 0 },
  source: {
    label: "AirLabs",
    authentication: "Server API key",
    available: true,
    paused: false,
    automationRequestCount: 8,
    automationRequestCap: 800,
    interactiveRequestCount: 2,
  },
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 1400,
    height: 900,
    top: 0,
    left: 0,
    right: 1400,
    bottom: 900,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("FlightSignal workspace", () => {
  it("shows assigned travel truthfully and resizes all operational regions", () => {
    render(<FlightSignalWorkspace dashboard={dashboard} />);

    expect(
      screen.getByRole("heading", { name: "Flight stream" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Live · airborne").length).toBeGreaterThan(0);
    expect(screen.getByTestId("flight-globe")).toHaveTextContent("flight-1");
    expect(
      screen.getByText(/AirLabs identifies a flight and aircraft/i),
    ).toBeInTheDocument();

    const streamHandle = screen.getByRole("separator", {
      name: "Resize flight stream",
    });
    const detailHandle = screen.getByRole("separator", {
      name: "Resize flight detail panel",
    });
    const timelineHandle = screen.getByRole("separator", {
      name: "Resize flight timeline",
    });
    fireEvent.keyDown(streamHandle, { key: "ArrowRight" });
    fireEvent.keyDown(detailHandle, { key: "ArrowLeft" });
    fireEvent.keyDown(timelineHandle, { key: "ArrowUp" });

    const shell = streamHandle.closest("div");
    expect(streamHandle).toHaveAttribute("aria-valuenow", "336");
    expect(detailHandle).toHaveAttribute("aria-valuenow", "406");
    expect(timelineHandle).toHaveAttribute("aria-valuenow", "138");
    expect(shell?.style.getPropertyValue("--flight-queue-width")).toBe("336px");
    expect(shell?.style.getPropertyValue("--flight-dossier-width")).toBe(
      "406px",
    );
    expect(shell?.style.getPropertyValue("--flight-timeline-height")).toBe(
      "138px",
    );
  });

  it("collapses the map summary to the selected flight number", async () => {
    const user = userEvent.setup();
    render(<FlightSignalWorkspace dashboard={dashboard} />);

    await user.click(
      screen.getByRole("button", { name: "Minimize UA2276 flight summary" }),
    );

    const expandButton = screen.getByRole("button", {
      name: "Expand UA2276 flight summary",
    });
    const overlay = expandButton.closest("article");
    expect(overlay).toHaveAttribute("data-minimized", "true");
    expect(overlay).toHaveTextContent("UA2276");
    expect(overlay).not.toHaveTextContent("AirLabs position");

    await user.click(expandButton);
    expect(
      screen.getByRole("button", { name: "Minimize UA2276 flight summary" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("looks up and confirms an AirLabs flight before assigning a traveler", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    render(
      <TrackFlightEditor
        activeOperatorId="operator-1"
        onClose={vi.fn()}
        onCreated={onCreated}
        people={dashboard.people}
      />,
    );

    await user.type(
      screen.getByRole("textbox", { name: /Passenger flight ID/i }),
      "UA 2276",
    );
    await user.click(
      screen.getByRole("button", { name: "Find current flight" }),
    );
    expect(await screen.findByText("AirLabs match · scheduled")).toBeVisible();
    expect(
      screen.getByText(/Washington Dulles.*Los Angeles/i),
    ).toBeInTheDocument();

    await user.selectOptions(
      screen.getByLabelText(/^Person/),
      dashboard.people[0].id,
    );
    await user.click(screen.getByRole("button", { name: "Assign flight" }));

    expect(actionMocks.createTrackedFlightAction).toHaveBeenCalledOnce();
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("flight-2"));
  });
});
