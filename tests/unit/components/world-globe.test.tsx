import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorldGlobe } from "@/components/globe/world-globe";
import { cycloneFixture, earthquakeFixture } from "../../fixtures/events";

const globeHarness = vi.hoisted(() => ({
  props: {} as Record<string, unknown>,
  pointOfView: vi.fn((next?: unknown) =>
    next ? {} : { lat: 0, lng: 0, altitude: 2 },
  ),
  pauseAnimation: vi.fn(),
  resumeAnimation: vi.fn(),
  controls: {
    autoRotate: false,
    enablePan: true,
    enableDamping: true,
    dampingFactor: 0,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
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
          pauseAnimation: globeHarness.pauseAnimation,
          resumeAnimation: globeHarness.resumeAnimation,
          controls: () => globeHarness.controls,
          renderer: () => ({ domElement: document.createElement("canvas") }),
        }));
        React.useEffect(() => {
          if (typeof onGlobeReady === "function") {
            onGlobeReady();
          }
        }, [onGlobeReady]);

        return (
          <button
            onClick={() => {
              const points = props.pointsData;
              if (
                typeof props.onPointClick === "function" &&
                Array.isArray(points) &&
                points[0]
              ) {
                props.onPointClick(points[0]);
              }
            }}
            type="button"
          >
            Mock canvas marker
          </button>
        );
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

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  stubReducedMotion(false);
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

describe("WorldGlobe", () => {
  it("passes the canonical visible set to Globe.gl and synchronizes click, focus, and reset", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClearSelection = vi.fn();
    const { rerender } = render(
      <WorldGlobe
        events={[earthquakeFixture, cycloneFixture]}
        onClearSelection={onClearSelection}
        onSelect={onSelect}
      />,
    );

    await screen.findByRole("button", { name: "Mock canvas marker" });
    await waitFor(() => expect(globeHarness.props.pointsData).toHaveLength(2));
    await user.click(
      screen.getByRole("button", { name: "Mock canvas marker" }),
    );
    expect(onSelect).toHaveBeenCalledWith(earthquakeFixture.id);

    rerender(
      <WorldGlobe
        events={[earthquakeFixture, cycloneFixture]}
        onClearSelection={onClearSelection}
        onSelect={onSelect}
        selectedEvent={earthquakeFixture}
      />,
    );
    await waitFor(() =>
      expect(globeHarness.pointOfView).toHaveBeenCalledWith(
        { lat: 38.322, lng: 143.248, altitude: 1.35 },
        850,
      ),
    );

    await user.click(screen.getByRole("button", { name: /global view/i }));
    expect(onClearSelection).toHaveBeenCalledOnce();
    expect(globeHarness.pointOfView).toHaveBeenCalledWith(
      { lat: 14, lng: 8, altitude: 2.25 },
      800,
    );
  });

  it("removes camera and layer transitions when reduced motion is requested", async () => {
    stubReducedMotion(true);

    render(
      <WorldGlobe
        events={[earthquakeFixture]}
        onClearSelection={vi.fn()}
        onSelect={vi.fn()}
        selectedEvent={earthquakeFixture}
      />,
    );

    await waitFor(() =>
      expect(globeHarness.pointOfView).toHaveBeenCalledWith(
        { lat: 38.322, lng: 143.248, altitude: 1.35 },
        0,
      ),
    );
    await waitFor(() =>
      expect(globeHarness.props.pointsTransitionDuration).toBe(0),
    );
    expect(globeHarness.props.labelsTransitionDuration).toBe(0);
    expect(globeHarness.props.ringsData).toEqual([]);
  });
});
