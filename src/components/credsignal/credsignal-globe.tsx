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
  credSignalPointTooltip,
  toCredSignalGlobePoints,
  type CredSignalGlobePoint,
} from "@/components/credsignal/credsignal-globe-model";
import type { CredSignalProtecteeDto } from "@/features/credsignal/types";

type CountryFeature = Feature<Polygon | MultiPolygon, { ADMIN?: string }>;

interface CountryPolygonDatum {
  geometry: Polygon | MultiPolygon;
  label: string;
}

const globalView = { lat: 18, lng: 8, altitude: 2.25 } as const;

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

function useReducedMotion() {
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

interface CredSignalGlobeProps {
  protectees: CredSignalProtecteeDto[];
  selectedProtectee?: CredSignalProtecteeDto;
  onSelect: (protecteeId: string) => void;
  onClearSelection: () => void;
}

export function CredSignalGlobe({
  protectees,
  selectedProtectee,
  onSelect,
  onClearSelection,
}: CredSignalGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [countries, setCountries] = useState<CountryFeature[]>([]);
  const [boundaryError, setBoundaryError] = useState(false);
  const [globeReady, setGlobeReady] = useState(false);
  const reducedMotion = useReducedMotion();
  const size = useElementSize(containerRef);
  const points = useMemo(
    () => toCredSignalGlobePoints(protectees),
    [protectees],
  );
  const selectedPoint = points.find(
    (point) => point.id === selectedProtectee?.id,
  );
  const polygons = useMemo<CountryPolygonDatum[]>(
    () =>
      countries.map((feature) => ({
        geometry: feature.geometry,
        label: feature.properties.ADMIN ?? "",
      })),
    [countries],
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
    globeRef.current?.pointOfView(globalView, reducedMotion ? 0 : 800);
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
    globe.pointOfView(globalView, 0);
    globe.renderer().domElement.setAttribute("role", "img");
    globe
      .renderer()
      .domElement.setAttribute(
        "aria-label",
        "Interactive 3D Earth showing protectee locations and active credential risk.",
      );
    setGlobeReady(true);
  }, [reducedMotion]);

  useEffect(() => {
    if (!globeReady || !selectedPoint) {
      return;
    }
    globeRef.current?.pointOfView(
      {
        lat: selectedPoint.latitude,
        lng: selectedPoint.longitude,
        altitude: 1.35,
      },
      reducedMotion ? 0 : 850,
    );
  }, [globeReady, reducedMotion, selectedPoint]);

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

  return (
    <div
      aria-label="Global protectee risk map"
      className="globe-shell credsignal-globe-shell"
      data-focused-protectee-id={selectedProtectee?.id}
      data-protectee-count={points.length}
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
          labelLat={(value) => (value as CredSignalGlobePoint).latitude}
          labelLng={(value) => (value as CredSignalGlobePoint).longitude}
          labelSize={0.42}
          labelText={(value) => (value as CredSignalGlobePoint).displayName}
          labelsData={selectedPoint ? [selectedPoint] : []}
          labelsTransitionDuration={reducedMotion ? 0 : 250}
          onGlobeReady={handleGlobeReady}
          onLabelClick={(value) => onSelect((value as CredSignalGlobePoint).id)}
          onPointClick={(value) => onSelect((value as CredSignalGlobePoint).id)}
          pointAltitude={(value) => (value as CredSignalGlobePoint).altitude}
          pointColor={(value) => (value as CredSignalGlobePoint).color}
          pointLabel={(value) =>
            credSignalPointTooltip(value as CredSignalGlobePoint)
          }
          pointLat={(value) => (value as CredSignalGlobePoint).latitude}
          pointLng={(value) => (value as CredSignalGlobePoint).longitude}
          pointRadius={(value) => (value as CredSignalGlobePoint).radius}
          pointResolution={8}
          pointsData={points}
          pointsTransitionDuration={reducedMotion ? 0 : 250}
          polygonAltitude={0.004}
          polygonCapColor={() => "rgba(20, 35, 42, 0.08)"}
          polygonGeoJsonGeometry={(value) =>
            (value as CountryPolygonDatum).geometry as never
          }
          polygonLabel={(value) => (value as CountryPolygonDatum).label}
          polygonSideColor={() => "rgba(0, 0, 0, 0)"}
          polygonStrokeColor={() => "rgba(159, 219, 224, 0.42)"}
          polygonsData={polygons}
          polygonsTransitionDuration={reducedMotion ? 0 : 250}
          ref={globeRef}
          ringAltitude={0.025}
          ringColor={() => [
            "rgba(223, 247, 248, 0.95)",
            "rgba(88, 205, 221, 0)",
          ]}
          ringLat={(value) => (value as CredSignalGlobePoint).latitude}
          ringLng={(value) => (value as CredSignalGlobePoint).longitude}
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
          Preparing protectee map…
        </div>
      ) : null}
      {boundaryError ? (
        <div className="globe-asset-warning" role="status">
          Country outlines unavailable
        </div>
      ) : null}
      <button
        className="globe-reset-button"
        onClick={() => {
          onClearSelection();
          focusGlobal();
        }}
        type="button"
      >
        <span aria-hidden="true">◎</span>
        Global view
      </button>
    </div>
  );
}
