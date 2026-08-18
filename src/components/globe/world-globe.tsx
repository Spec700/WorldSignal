"use client";

import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
} from "geojson";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";

import {
  globePointTooltip,
  toGlobeEventPoints,
  type GlobeEventPoint,
} from "@/components/globe/globe-model";
import type { WorldEvent } from "@/lib/events/types";

type CountryFeature = Feature<Polygon | MultiPolygon, { ADMIN?: string }>;

const GLOBAL_VIEW = { lat: 14, lng: 8, altitude: 2.25 } as const;

function isCountryCollection(
  value: unknown,
): value is FeatureCollection<Polygon | MultiPolygon, { ADMIN?: string }> {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "FeatureCollection" &&
    "features" in value &&
    Array.isArray(value.features)
  );
}

function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reducedMotion;
}

function useElementSize(elementRef: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) {
      return;
    }

    const updateSize = () => {
      const bounds = element.getBoundingClientRect();
      setSize({
        width: Math.max(1, Math.floor(bounds.width)),
        height: Math.max(1, Math.floor(bounds.height)),
      });
    };
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    updateSize();

    return () => observer.disconnect();
  }, [elementRef]);

  return size;
}

interface WorldGlobeProps {
  events: WorldEvent[];
  selectedEvent?: WorldEvent;
  onSelect: (eventId: string) => void;
  onClearSelection: () => void;
}

export function WorldGlobe({
  events,
  selectedEvent,
  onSelect,
  onClearSelection,
}: WorldGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [countries, setCountries] = useState<CountryFeature[]>([]);
  const [boundaryError, setBoundaryError] = useState(false);
  const [globeReady, setGlobeReady] = useState(false);
  const reducedMotion = useReducedMotion();
  const size = useElementSize(containerRef);
  const points = useMemo(() => toGlobeEventPoints(events), [events]);
  const selectedPoint = useMemo(
    () => points.find((point) => point.id === selectedEvent?.id),
    [points, selectedEvent?.id],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadBoundaries() {
      try {
        const response = await fetch("/data/natural-earth-admin-0.geojson", {
          cache: "force-cache",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Natural Earth returned HTTP ${response.status}.`);
        }
        const value: unknown = await response.json();
        if (!isCountryCollection(value)) {
          throw new Error("Natural Earth data is not a FeatureCollection.");
        }
        setCountries(value.features);
        setBoundaryError(false);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setBoundaryError(true);
      }
    }

    void loadBoundaries();
    return () => controller.abort();
  }, []);

  const focusGlobal = useCallback(() => {
    globeRef.current?.pointOfView(GLOBAL_VIEW, reducedMotion ? 0 : 800);
  }, [reducedMotion]);

  const handleGlobeReady = useCallback(() => {
    const globe = globeRef.current;
    if (!globe) {
      return;
    }

    const controls = globe.controls();
    controls.autoRotate = false;
    controls.enablePan = false;
    controls.enableDamping = !reducedMotion;
    controls.dampingFactor = 0.08;
    globe.pointOfView(GLOBAL_VIEW, 0);
    globe.renderer().domElement.setAttribute("role", "img");
    globe
      .renderer()
      .domElement.setAttribute(
        "aria-label",
        "Interactive 3D Earth showing the same hazard events available in the event stream.",
      );
    setGlobeReady(true);
  }, [reducedMotion]);

  useEffect(() => {
    if (!globeReady) {
      return;
    }
    const controls = globeRef.current?.controls();
    if (!controls) {
      return;
    }
    controls.enableDamping = !reducedMotion;
  }, [globeReady, reducedMotion]);

  useEffect(() => {
    if (!globeReady || !selectedEvent) {
      return;
    }
    globeRef.current?.pointOfView(
      {
        lat: selectedEvent.centroid.latitude,
        lng: selectedEvent.centroid.longitude,
        altitude: 1.35,
      },
      reducedMotion ? 0 : 850,
    );
  }, [globeReady, reducedMotion, selectedEvent]);

  useEffect(() => {
    if (!globeReady) {
      return;
    }
    const globe = globeRef.current;
    const controls = globe?.controls();
    if (!globe || !controls) {
      return;
    }

    const stopCameraTween = () => {
      const pointOfView = globe.pointOfView();
      globe.pointOfView(pointOfView, 0);
    };
    controls.addEventListener("start", stopCameraTween);
    return () => controls.removeEventListener("start", stopCameraTween);
  }, [globeReady]);

  useEffect(() => {
    if (!globeReady) {
      return;
    }

    const handleVisibility = () => {
      if (document.hidden) {
        globeRef.current?.pauseAnimation();
      } else {
        globeRef.current?.resumeAnimation();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    handleVisibility();
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [globeReady]);

  const handleGlobalReset = useCallback(() => {
    onClearSelection();
    focusGlobal();
  }, [focusGlobal, onClearSelection]);

  return (
    <div
      aria-label="Interactive global hazard map"
      className="globe-shell"
      data-event-count={points.length}
      data-focused-event-id={selectedEvent?.id}
      ref={containerRef}
      role="group"
    >
      {size.width > 0 && size.height > 0 ? (
        <Globe
          animateIn={false}
          atmosphereAltitude={0.12}
          atmosphereColor="#58cddd"
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl="/textures/blue-marble.webp"
          height={size.height}
          labelAltitude={0.075}
          labelColor={() => "#dff7f8"}
          labelDotRadius={0.22}
          labelIncludeDot={false}
          labelLat={(value) => (value as GlobeEventPoint).latitude}
          labelLng={(value) => (value as GlobeEventPoint).longitude}
          labelSize={0.42}
          labelText={(value) => (value as GlobeEventPoint).title}
          labelsData={selectedPoint ? [selectedPoint] : []}
          labelsTransitionDuration={reducedMotion ? 0 : 250}
          onGlobeReady={handleGlobeReady}
          onLabelClick={(value) => onSelect((value as GlobeEventPoint).id)}
          onPointClick={(value) => onSelect((value as GlobeEventPoint).id)}
          pointAltitude={(value) => (value as GlobeEventPoint).altitude}
          pointColor={(value) => (value as GlobeEventPoint).color}
          pointLabel={(value) => globePointTooltip(value as GlobeEventPoint)}
          pointLat={(value) => (value as GlobeEventPoint).latitude}
          pointLng={(value) => (value as GlobeEventPoint).longitude}
          pointRadius={(value) => (value as GlobeEventPoint).radius}
          pointResolution={8}
          pointsData={points}
          pointsTransitionDuration={reducedMotion ? 0 : 250}
          polygonAltitude={0.004}
          polygonCapColor={() => "rgba(20, 35, 42, 0.08)"}
          polygonGeoJsonGeometry={(value) =>
            (value as CountryFeature).geometry as never
          }
          polygonLabel={(value) =>
            (value as CountryFeature).properties.ADMIN ?? ""
          }
          polygonSideColor={() => "rgba(0, 0, 0, 0)"}
          polygonStrokeColor={() => "rgba(159, 219, 224, 0.42)"}
          polygonsData={countries}
          polygonsTransitionDuration={0}
          ref={globeRef}
          ringAltitude={0.025}
          ringColor={() => [
            "rgba(223, 247, 248, 0.95)",
            "rgba(88, 205, 221, 0)",
          ]}
          ringLat={(value) => (value as GlobeEventPoint).latitude}
          ringLng={(value) => (value as GlobeEventPoint).longitude}
          ringMaxRadius={1.35}
          ringPropagationSpeed={0.75}
          ringRepeatPeriod={1_100}
          ringsData={selectedPoint && !reducedMotion ? [selectedPoint] : []}
          showAtmosphere
          showGraticules
          width={size.width}
        />
      ) : null}

      {!globeReady ? (
        <div className="globe-loading" role="status">
          Preparing local globe…
        </div>
      ) : null}

      {boundaryError ? (
        <div className="globe-asset-warning" role="status">
          Country outlines unavailable
        </div>
      ) : null}

      <button
        className="globe-reset-button"
        onClick={handleGlobalReset}
        type="button"
      >
        <span aria-hidden="true">◎</span>
        Global view
      </button>
    </div>
  );
}
