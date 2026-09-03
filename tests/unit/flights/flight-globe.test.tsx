import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FlightGlobe } from "@/components/flightsignal/flight-globe";
import type { TrackedFlightDto } from "@/features/flights/types";

const globeHarness = vi.hoisted(() => ({
  props: {} as Record<string, unknown>,
  pointOfView: vi.fn(),
  controls: {
    autoRotate: false,
    enablePan: true,
    enableDamping: true,
    dampingFactor: 0,
  },
}));

vi.mock("react-globe.gl", async () => {
  const React = await import("react");
  return {
    default: React.forwardRef<Record<string, unknown>, Record<string, unknown>>(
      function MockGlobe(props, ref) {
        globeHarness.props = props;
        const { onGlobeReady } = props;
        React.useImperativeHandle(ref, () => ({
          pointOfView: globeHarness.pointOfView,
          controls: () => globeHarness.controls,
          renderer: () => ({ domElement: document.createElement("canvas") }),
        }));
        React.useEffect(() => {
          if (typeof onGlobeReady === "function") {
            onGlobeReady();
          }
        }, [onGlobeReady]);
        return <span>Mock flight globe</span>;
      },
    ),
  };
});

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

const flight = {
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
  trackingStatus: "tracking",
  displayStatus: "live_airborne",
  consecutiveSourceErrors: 0,
  assignments: [],
  latestObservation: {
    id: "observation-2",
    aircraftIcaoHex: "aa3ae5",
    latitude: 39.1,
    longitude: -82.8,
    trackDegrees: 271,
    onGround: false,
    sourceObservedAt: "2026-09-02T18:00:00.000Z",
    retrievedAt: "2026-09-02T18:00:01.000Z",
  },
  candidateAircraft: [],
  trail: [
    {
      id: "observation-1",
      aircraftIcaoHex: "aa3ae5",
      latitude: 39,
      longitude: -80,
      onGround: false,
      sourceObservedAt: "2026-09-02T17:59:00.000Z",
      retrievedAt: "2026-09-02T17:59:01.000Z",
    },
    {
      id: "observation-2",
      aircraftIcaoHex: "aa3ae5",
      latitude: 39.1,
      longitude: -82.8,
      onGround: false,
      sourceObservedAt: "2026-09-02T18:00:00.000Z",
      retrievedAt: "2026-09-02T18:00:01.000Z",
    },
  ],
  createdAt: "2026-09-02T16:00:00.000Z",
  updatedAt: "2026-09-02T18:00:01.000Z",
} satisfies TrackedFlightDto;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 800,
    height: 600,
    top: 0,
    left: 0,
    right: 800,
    bottom: 600,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ type: "FeatureCollection", features: [] }),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("FlightSignal globe", () => {
  it("renders the confirmed route, breadcrumb, airports, and aircraft separately", async () => {
    const user = userEvent.setup();
    render(<FlightGlobe flight={flight} />);

    await screen.findByText("Mock flight globe");
    await waitFor(() => expect(globeHarness.props.arcsData).toHaveLength(1));
    expect(globeHarness.props.arcsData).toEqual([
      expect.objectContaining({
        startLatitude: 39.1,
        startLongitude: -82.8,
        endLatitude: 33.9425,
        endLongitude: -118.408,
      }),
    ]);
    expect(globeHarness.props.pathsData).toHaveLength(1);
    expect(globeHarness.props.pointsData).toHaveLength(2);
    expect(globeHarness.props.objectsData).toHaveLength(1);
    expect(globeHarness.pointOfView).toHaveBeenCalledWith(
      { lat: 39.1, lng: -82.8, altitude: 1.45 },
      850,
    );

    await user.click(screen.getByRole("button", { name: /global view/i }));
    expect(globeHarness.pointOfView).toHaveBeenCalledWith(
      { lat: 18, lng: 8, altitude: 2.25 },
      800,
    );
  });
});
