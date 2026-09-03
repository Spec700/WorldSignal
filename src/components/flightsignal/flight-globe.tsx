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

import type { TrackedFlightDto } from "@/features/flights/types";

type CountryFeature = Feature<Polygon | MultiPolygon, { ADMIN?: string }>;

interface CountryPolygonDatum {
  geometry: Polygon | MultiPolygon;
  label: string;
}

interface AirportPoint {
  latitude: number;
  longitude: number;
  label: string;
  color: string;
}

interface FlightArc {
  startLatitude: number;
  startLongitude: number;
  endLatitude: number;
  endLongitude: number;
}

interface FlightPathPoint {
  latitude: number;
  longitude: number;
  altitude: number;
}

interface FlightPath {
  points: FlightPathPoint[];
}

interface AircraftObject {
  latitude: number;
  longitude: number;
  altitude: number;
  trackDegrees: number;
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

function createAircraftObject() {
  const material = new THREE.MeshBasicMaterial({ color: "#66eff5" });
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

export function FlightGlobe({ flight }: { flight?: TrackedFlightDto }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [countries, setCountries] = useState<CountryFeature[]>([]);
  const [boundaryError, setBoundaryError] = useState(false);
  const [globeReady, setGlobeReady] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const reducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    const update = () => {
      const bounds = element.getBoundingClientRect();
      setSize({
        width: Math.max(1, Math.floor(bounds.width)),
        height: Math.max(1, Math.floor(bounds.height)),
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, []);

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

  const polygons = useMemo<CountryPolygonDatum[]>(
    () =>
      countries.map((feature) => ({
        geometry: feature.geometry,
        label: feature.properties.ADMIN ?? "",
      })),
    [countries],
  );
  const airportPoints = useMemo<AirportPoint[]>(
    () =>
      flight
        ? [
            {
              latitude: flight.origin.latitude,
              longitude: flight.origin.longitude,
              label: `${flight.origin.iata} · ${flight.origin.name}`,
              color: "#86a8ad",
            },
            {
              latitude: flight.destination.latitude,
              longitude: flight.destination.longitude,
              label: `${flight.destination.iata} · ${flight.destination.name}`,
              color: "#f1b74d",
            },
          ]
        : [],
    [flight],
  );
  const arcs = useMemo<FlightArc[]>(() => {
    if (!flight) {
      return [];
    }
    const current = flight.latestObservation;
    return [
      {
        startLatitude: current?.latitude ?? flight.origin.latitude,
        startLongitude: current?.longitude ?? flight.origin.longitude,
        endLatitude: flight.destination.latitude,
        endLongitude: flight.destination.longitude,
      },
    ];
  }, [flight]);
  const paths = useMemo<FlightPath[]>(
    () =>
      flight && flight.trail.length > 1
        ? [
            {
              points: flight.trail.flatMap((observation) =>
                observation.latitude !== undefined &&
                observation.longitude !== undefined
                  ? [
                      {
                        latitude: observation.latitude,
                        longitude: observation.longitude,
                        altitude: 0.032,
                      },
                    ]
                  : [],
              ),
            },
          ]
        : [],
    [flight],
  );
  const aircraft = useMemo<AircraftObject[]>(() => {
    const observation = flight?.latestObservation;
    return observation?.latitude !== undefined &&
      observation.longitude !== undefined
      ? [
          {
            latitude: observation.latitude,
            longitude: observation.longitude,
            altitude: 0.045,
            trackDegrees: observation.trackDegrees ?? 0,
          },
        ]
      : [];
  }, [flight]);

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
        "Tracked flight route, observed aircraft position, and breadcrumb trail",
      );
    setGlobeReady(true);
  }, [reducedMotion]);

  useEffect(() => {
    if (!globeReady || !flight) {
      return;
    }
    const observation = flight.latestObservation;
    globeRef.current?.pointOfView(
      {
        lat: observation?.latitude ?? flight.origin.latitude,
        lng: observation?.longitude ?? flight.origin.longitude,
        altitude: 1.45,
      },
      reducedMotion ? 0 : 850,
    );
  }, [flight, globeReady, reducedMotion]);

  return (
    <div
      aria-label="FlightSignal globe"
      className="globe-shell"
      data-flight-id={flight?.id}
      ref={containerRef}
      role="group"
    >
      {size.width > 0 && size.height > 0 ? (
        <Globe
          animateIn={false}
          arcAltitude={0.16}
          arcColor={() => "rgba(241, 183, 77, 0.78)"}
          arcDashAnimateTime={reducedMotion ? 0 : 2_400}
          arcDashGap={0.55}
          arcDashInitialGap={0.15}
          arcDashLength={0.28}
          arcEndLat={(value) => (value as FlightArc).endLatitude}
          arcEndLng={(value) => (value as FlightArc).endLongitude}
          arcStartLat={(value) => (value as FlightArc).startLatitude}
          arcStartLng={(value) => (value as FlightArc).startLongitude}
          arcStroke={0.42}
          arcsData={arcs}
          atmosphereAltitude={0.12}
          atmosphereColor="#58cddd"
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl="/textures/blue-marble.webp"
          height={size.height}
          objectAltitude={(value) => (value as AircraftObject).altitude}
          objectFacesSurfaces
          objectLat={(value) => (value as AircraftObject).latitude}
          objectLng={(value) => (value as AircraftObject).longitude}
          objectRotation={(value) => ({
            x: 0,
            y: 0,
            z: -THREE.MathUtils.degToRad(
              (value as AircraftObject).trackDegrees,
            ),
          })}
          objectsData={aircraft}
          objectThreeObject={createAircraftObject}
          onGlobeReady={handleGlobeReady}
          pathColor={() => "rgba(102, 239, 245, 0.94)"}
          pathPointAlt={(value) => (value as FlightPathPoint).altitude}
          pathPointLat={(value) => (value as FlightPathPoint).latitude}
          pathPointLng={(value) => (value as FlightPathPoint).longitude}
          pathPoints={(value) => (value as FlightPath).points}
          pathStroke={1.7}
          pathsData={paths}
          pathTransitionDuration={reducedMotion ? 0 : 250}
          pointAltitude={0.014}
          pointColor={(value) => (value as AirportPoint).color}
          pointLabel={(value) => (value as AirportPoint).label}
          pointLat={(value) => (value as AirportPoint).latitude}
          pointLng={(value) => (value as AirportPoint).longitude}
          pointRadius={0.32}
          pointsData={airportPoints}
          polygonAltitude={0.004}
          polygonCapColor={() => "rgba(20, 35, 42, 0.08)"}
          polygonGeoJsonGeometry={(value) =>
            (value as CountryPolygonDatum).geometry as never
          }
          polygonLabel={(value) => (value as CountryPolygonDatum).label}
          polygonSideColor={() => "rgba(0, 0, 0, 0)"}
          polygonStrokeColor={() => "rgba(159, 219, 224, 0.42)"}
          polygonsData={polygons}
          ref={globeRef}
          showAtmosphere
          showGraticules
          width={size.width}
        />
      ) : null}

      {!globeReady ? (
        <div className="globe-loading" role="status">
          {flight ? "Preparing tracked flight globe…" : "No flight selected"}
        </div>
      ) : null}
      {boundaryError ? (
        <div className="globe-asset-warning" role="status">
          Country outlines unavailable
        </div>
      ) : null}
      <button
        className="globe-reset-button"
        onClick={focusGlobal}
        type="button"
      >
        <span aria-hidden="true">◎</span>
        Global view
      </button>
    </div>
  );
}
