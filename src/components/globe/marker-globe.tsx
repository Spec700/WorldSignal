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
import * as THREE from "three";

type CountryFeature = Feature<Polygon | MultiPolygon, { ADMIN?: string }>;

interface CountryPolygonDatum {
  geometry: Polygon | MultiPolygon;
  label: string;
}

export interface MarkerGlobePoint {
  id: string;
  latitude: number;
  longitude: number;
  color: string;
  radius: number;
  altitude: number;
  displayName: string;
  markerType?: "point" | "aircraft";
  trackDegrees?: number;
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

function createAircraftObject(point: MarkerGlobePoint) {
  const material = new THREE.MeshBasicMaterial({ color: point.color });
  const group = new THREE.Group();
  const fuselage = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.09, 0.08),
    material,
  );
  const wings = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.48, 0.045),
    material,
  );
  wings.position.x = -0.03;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.04), material);
  tail.position.x = -0.16;
  group.add(fuselage, wings, tail);
  group.scale.setScalar(4);
  return group;
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

interface MarkerGlobeProps<Point extends MarkerGlobePoint> {
  ariaLabel: string;
  emptyLabel: string;
  loadingLabel: string;
  onClearSelection: () => void;
  onSelect: (pointId: string) => void;
  pointTooltip: (point: Point) => string;
  points: Point[];
  selectedPointId?: string;
}

export function MarkerGlobe<Point extends MarkerGlobePoint>({
  ariaLabel,
  emptyLabel,
  loadingLabel,
  onClearSelection,
  onSelect,
  pointTooltip,
  points,
  selectedPointId,
}: MarkerGlobeProps<Point>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [countries, setCountries] = useState<CountryFeature[]>([]);
  const [boundaryError, setBoundaryError] = useState(false);
  const [globeReady, setGlobeReady] = useState(false);
  const reducedMotion = useReducedMotion();
  const size = useElementSize(containerRef);
  const selectedPoint = points.find((point) => point.id === selectedPointId);
  const locationPoints = useMemo(
    () => points.filter((point) => point.markerType !== "aircraft"),
    [points],
  );
  const aircraftPoints = useMemo(
    () => points.filter((point) => point.markerType === "aircraft"),
    [points],
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
    globe.renderer().domElement.setAttribute("aria-label", ariaLabel);
    setGlobeReady(true);
  }, [ariaLabel, reducedMotion]);

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
      aria-label={ariaLabel}
      className="globe-shell"
      data-marker-count={points.length}
      data-selected-marker-id={selectedPointId}
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
          labelLat={(value) => (value as Point).latitude}
          labelLng={(value) => (value as Point).longitude}
          labelSize={0.42}
          labelText={(value) => (value as Point).displayName}
          labelsData={selectedPoint ? [selectedPoint] : []}
          labelsTransitionDuration={reducedMotion ? 0 : 250}
          objectAltitude={(value) => (value as Point).altitude}
          objectFacesSurfaces
          objectLabel={(value) => pointTooltip(value as Point)}
          objectLat={(value) => (value as Point).latitude}
          objectLng={(value) => (value as Point).longitude}
          objectRotation={(value) => ({
            x: 0,
            y: 0,
            z: -THREE.MathUtils.degToRad((value as Point).trackDegrees ?? 0),
          })}
          objectsData={aircraftPoints}
          objectThreeObject={(value) =>
            createAircraftObject(value as MarkerGlobePoint)
          }
          onGlobeReady={handleGlobeReady}
          onLabelClick={(value) => onSelect((value as Point).id)}
          onObjectClick={(value) => onSelect((value as Point).id)}
          onPointClick={(value) => onSelect((value as Point).id)}
          pointAltitude={(value) => (value as Point).altitude}
          pointColor={(value) => (value as Point).color}
          pointLabel={(value) => pointTooltip(value as Point)}
          pointLat={(value) => (value as Point).latitude}
          pointLng={(value) => (value as Point).longitude}
          pointRadius={(value) => (value as Point).radius}
          pointResolution={8}
          pointsData={locationPoints}
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
          ringLat={(value) => (value as Point).latitude}
          ringLng={(value) => (value as Point).longitude}
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
          {points.length === 0 ? emptyLabel : loadingLabel}
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
