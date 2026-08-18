import type { Geometry, Polygon, Position } from "geojson";

import type { GdacsGeometryCollection } from "@/lib/sources/gdacs/geometry";

interface GeometryProperties {
  semanticClass?: string;
  label?: string;
  featureType?: string;
  observedAt?: string;
}

export interface GlobeGeometryPath {
  id: string;
  points: Position[];
  color: string;
  label: string;
}

export interface GlobeGeometryPolygon {
  kind: "detail";
  id: string;
  geometry: Polygon;
  capColor: string;
  strokeColor: string;
  label: string;
}

export interface GlobeGeometryLayers {
  paths: GlobeGeometryPath[];
  polygons: GlobeGeometryPolygon[];
}

function geometryColor(properties: GeometryProperties): string {
  const semanticClass = properties.semanticClass?.toLocaleLowerCase() ?? "";
  if (semanticClass.includes("red")) {
    return "#ff6b64";
  }
  if (semanticClass.includes("orange")) {
    return "#f2ad53";
  }
  return "#58cddd";
}

function geometryLabel(properties: GeometryProperties): string {
  return (
    properties.label ??
    properties.featureType ??
    properties.semanticClass ??
    "GDACS detail geometry"
  );
}

function signedRingArea(ring: Position[]): number {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area / 2;
}

function rewindPolygonCoordinates(coordinates: Position[][]): Position[][] {
  return coordinates.map((ring, index) => {
    const shouldBeClockwise = index === 0;
    const isClockwise = signedRingArea(ring) < 0;
    return shouldBeClockwise === isClockwise ? ring : [...ring].reverse();
  });
}

function collectGeometry(
  geometry: Geometry,
  properties: GeometryProperties,
  key: string,
  layers: GlobeGeometryLayers,
) {
  const color = geometryColor(properties);
  const label = geometryLabel(properties);

  switch (geometry.type) {
    case "LineString":
      layers.paths.push({
        id: key,
        points: geometry.coordinates,
        color,
        label,
      });
      return;

    case "MultiLineString":
      geometry.coordinates.forEach((points, index) =>
        layers.paths.push({
          id: `${key}:line:${index}`,
          points,
          color,
          label,
        }),
      );
      return;

    case "Polygon":
      layers.polygons.push({
        kind: "detail",
        id: key,
        geometry: {
          type: "Polygon",
          coordinates: rewindPolygonCoordinates(geometry.coordinates),
        },
        capColor: `${color}42`,
        strokeColor: color,
        label,
      });
      return;

    case "MultiPolygon":
      geometry.coordinates.forEach((coordinates, index) =>
        layers.polygons.push({
          kind: "detail",
          id: `${key}:polygon:${index}`,
          geometry: {
            type: "Polygon",
            coordinates: rewindPolygonCoordinates(coordinates),
          },
          capColor: `${color}42`,
          strokeColor: color,
          label,
        }),
      );
      return;

    case "GeometryCollection":
      geometry.geometries.forEach((child, index) =>
        collectGeometry(child, properties, `${key}:geometry:${index}`, layers),
      );
      return;

    case "Point":
    case "MultiPoint":
      return;
  }
}

export function toGlobeGeometryLayers(
  collection?: GdacsGeometryCollection,
): GlobeGeometryLayers {
  const layers: GlobeGeometryLayers = { paths: [], polygons: [] };
  if (!collection) {
    return layers;
  }

  collection.features.forEach((feature, index) =>
    collectGeometry(
      feature.geometry,
      feature.properties,
      `detail:${index}`,
      layers,
    ),
  );
  return layers;
}

function visitPositions(
  geometry: Geometry,
  visit: (position: Position) => void,
) {
  switch (geometry.type) {
    case "Point":
      visit(geometry.coordinates);
      return;
    case "MultiPoint":
    case "LineString":
      geometry.coordinates.forEach(visit);
      return;
    case "MultiLineString":
    case "Polygon":
      geometry.coordinates.forEach((line) => line.forEach(visit));
      return;
    case "MultiPolygon":
      geometry.coordinates.forEach((polygon) =>
        polygon.forEach((line) => line.forEach(visit)),
      );
      return;
    case "GeometryCollection":
      geometry.geometries.forEach((child) => visitPositions(child, visit));
  }
}

function normalizeLongitude(longitude: number): number {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function unwrapLongitude(longitude: number, anchor: number): number {
  let unwrapped = longitude;
  while (unwrapped - anchor > 180) unwrapped -= 360;
  while (unwrapped - anchor < -180) unwrapped += 360;
  return unwrapped;
}

export function deriveGeometryCameraView(
  collection: GdacsGeometryCollection,
  anchor: { latitude: number; longitude: number },
): { lat: number; lng: number; altitude: number } | undefined {
  let minimumLatitude = Number.POSITIVE_INFINITY;
  let maximumLatitude = Number.NEGATIVE_INFINITY;
  let minimumLongitude = Number.POSITIVE_INFINITY;
  let maximumLongitude = Number.NEGATIVE_INFINITY;

  for (const feature of collection.features) {
    visitPositions(feature.geometry, (position) => {
      const longitude = unwrapLongitude(position[0], anchor.longitude);
      const latitude = position[1];
      minimumLongitude = Math.min(minimumLongitude, longitude);
      maximumLongitude = Math.max(maximumLongitude, longitude);
      minimumLatitude = Math.min(minimumLatitude, latitude);
      maximumLatitude = Math.max(maximumLatitude, latitude);
    });
  }

  if (
    !Number.isFinite(minimumLatitude) ||
    !Number.isFinite(maximumLatitude) ||
    !Number.isFinite(minimumLongitude) ||
    !Number.isFinite(maximumLongitude)
  ) {
    return undefined;
  }

  const latitudeSpan = maximumLatitude - minimumLatitude;
  const longitudeSpan = maximumLongitude - minimumLongitude;
  const span = Math.max(latitudeSpan, longitudeSpan);

  return {
    lat: (minimumLatitude + maximumLatitude) / 2,
    lng: normalizeLongitude((minimumLongitude + maximumLongitude) / 2),
    altitude: Math.min(2.15, Math.max(0.95, 0.9 + span / 55)),
  };
}
