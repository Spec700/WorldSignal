import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PeopleGlobe } from "@/components/people/people-globe";
import type { PersonDto } from "@/features/people/types";

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
          pauseAnimation: vi.fn(),
          resumeAnimation: vi.fn(),
        }));
        React.useEffect(() => {
          if (typeof onGlobeReady === "function") {
            onGlobeReady();
          }
        }, [onGlobeReady]);
        return <span>Mock people globe</span>;
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

const basePerson = {
  id: "person-home",
  displayName: "Home Person",
  tier: "standard",
  status: "active",
  identities: [],
  location: {
    id: "location-home",
    label: "New York, NY",
    latitude: 40.7128,
    longitude: -74.006,
    precision: "city",
    isActive: true,
    effectiveFrom: "2026-08-01T12:00:00.000Z",
  },
  locationHistory: [],
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
} satisfies PersonDto;

const traveler = {
  ...basePerson,
  id: "person-travel",
  displayName: "Travel Person",
  activeTravel: {
    assignmentId: "assignment-1",
    flightInstanceId: "flight-1",
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
    aircraft: { icaoHex: "aa3ae5" },
    position: {
      latitude: 39.1,
      longitude: -78.2,
      trackDegrees: 270,
      onGround: false,
      observedAt: "2026-09-02T18:05:00.000Z",
      retrievedAt: "2026-09-02T18:05:01.000Z",
      isStale: false,
    },
  },
} satisfies PersonDto;

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

describe("People globe", () => {
  it("renders approved locations as points and confirmed travel as aircraft", async () => {
    render(
      <PeopleGlobe
        onClearSelection={vi.fn()}
        onSelect={vi.fn()}
        people={[basePerson, traveler]}
        selectedPersonId={traveler.id}
      />,
    );

    await screen.findByText("Mock people globe");
    await waitFor(() => expect(globeHarness.props.pointsData).toHaveLength(1));
    expect(globeHarness.props.objectsData).toHaveLength(1);
    expect(globeHarness.props.labelsData).toEqual([
      expect.objectContaining({
        id: traveler.id,
        markerType: "aircraft",
        latitude: 39.1,
        longitude: -78.2,
      }),
    ]);
    expect(globeHarness.pointOfView).toHaveBeenCalledWith(
      { lat: 39.1, lng: -78.2, altitude: 1.35 },
      850,
    );
  });
});
