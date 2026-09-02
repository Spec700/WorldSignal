import type { Geometry, Position } from "geojson";

const EARTH_RADIUS_KM = 6371.0088;
const VECTOR_EPSILON = 1e-12;
const ARC_TOLERANCE_RADIANS = 1e-7;

type Vector3 = [number, number, number];

export interface GeographicPoint {
  latitude: number;
  longitude: number;
}

interface GeometryCollectionLike {
  features: ReadonlyArray<{ geometry: Geometry }>;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

function dot(left: Vector3, right: Vector3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: Vector3, right: Vector3): Vector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function magnitude(vector: Vector3): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function normalize(vector: Vector3): Vector3 | undefined {
  const length = magnitude(vector);
  if (length < VECTOR_EPSILON) {
    return undefined;
  }
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function negate(vector: Vector3): Vector3 {
  return [-vector[0], -vector[1], -vector[2]];
}

function angularDistance(left: Vector3, right: Vector3): number {
  return Math.acos(clampUnit(dot(left, right)));
}

function pointVector(point: GeographicPoint): Vector3 {
  const latitude = toRadians(point.latitude);
  const longitude = toRadians(point.longitude);
  const latitudeRadius = Math.cos(latitude);
  return [
    latitudeRadius * Math.cos(longitude),
    latitudeRadius * Math.sin(longitude),
    Math.sin(latitude),
  ];
}

function positionVector(position: Position): Vector3 {
  return pointVector({ latitude: position[1], longitude: position[0] });
}

function pointToSegmentRadians(
  point: Vector3,
  start: Vector3,
  end: Vector3,
): number {
  const endpointDistance = Math.min(
    angularDistance(point, start),
    angularDistance(point, end),
  );
  const normal = normalize(cross(start, end));
  if (!normal) {
    return endpointDistance;
  }

  const projection = normalize([
    point[0] - normal[0] * dot(point, normal),
    point[1] - normal[1] * dot(point, normal),
    point[2] - normal[2] * dot(point, normal),
  ]);
  if (!projection) {
    return endpointDistance;
  }

  const segmentLength = angularDistance(start, end);
  let closest = endpointDistance;
  for (const candidate of [projection, negate(projection)]) {
    const candidateArcLength =
      angularDistance(start, candidate) + angularDistance(candidate, end);
    if (Math.abs(candidateArcLength - segmentLength) <= ARC_TOLERANCE_RADIANS) {
      closest = Math.min(closest, angularDistance(point, candidate));
    }
  }
  return closest;
}

function distanceToPositionsRadians(
  point: Vector3,
  positions: readonly Position[],
): number {
  if (positions.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  if (positions.length === 1) {
    return angularDistance(point, positionVector(positions[0]));
  }

  let closest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < positions.length; index += 1) {
    closest = Math.min(
      closest,
      pointToSegmentRadians(
        point,
        positionVector(positions[index - 1]),
        positionVector(positions[index]),
      ),
    );
  }
  return closest;
}

function pointInRing(point: Vector3, ring: readonly Position[]): boolean {
  if (ring.length < 4) {
    return false;
  }

  const tangents = ring.map((position) => {
    const vertex = positionVector(position);
    const projection = dot(vertex, point);
    return normalize([
      vertex[0] - point[0] * projection,
      vertex[1] - point[1] * projection,
      vertex[2] - point[2] * projection,
    ]);
  });

  if (tangents.some((tangent) => !tangent)) {
    return true;
  }

  let winding = 0;
  for (let index = 1; index < tangents.length; index += 1) {
    const previous = tangents[index - 1];
    const current = tangents[index];
    if (!previous || !current) {
      continue;
    }
    winding += Math.atan2(
      dot(point, cross(previous, current)),
      dot(previous, current),
    );
  }
  return Math.abs(winding) > Math.PI;
}

function distanceToPolygonRadians(
  point: Vector3,
  rings: readonly Position[][],
): number {
  const outerRing = rings[0];
  if (!outerRing) {
    return Number.POSITIVE_INFINITY;
  }

  const boundaryDistance = Math.min(
    ...rings.map((ring) => distanceToPositionsRadians(point, ring)),
  );
  if (boundaryDistance <= ARC_TOLERANCE_RADIANS) {
    return 0;
  }

  const insideOuterRing = pointInRing(point, outerRing);
  const insideHole = rings.slice(1).some((ring) => pointInRing(point, ring));
  return insideOuterRing && !insideHole ? 0 : boundaryDistance;
}

function distanceToGeometryRadians(point: Vector3, geometry: Geometry): number {
  switch (geometry.type) {
    case "Point":
      return angularDistance(point, positionVector(geometry.coordinates));
    case "MultiPoint":
      return Math.min(
        ...geometry.coordinates.map((position) =>
          angularDistance(point, positionVector(position)),
        ),
      );
    case "LineString":
      return distanceToPositionsRadians(point, geometry.coordinates);
    case "MultiLineString":
      return Math.min(
        ...geometry.coordinates.map((line) =>
          distanceToPositionsRadians(point, line),
        ),
      );
    case "Polygon":
      return distanceToPolygonRadians(point, geometry.coordinates);
    case "MultiPolygon":
      return Math.min(
        ...geometry.coordinates.map((polygon) =>
          distanceToPolygonRadians(point, polygon),
        ),
      );
    case "GeometryCollection":
      return Math.min(
        ...geometry.geometries.map((child) =>
          distanceToGeometryRadians(point, child),
        ),
      );
  }
}

export function distanceBetweenPointsKm(
  first: GeographicPoint,
  second: GeographicPoint,
): number {
  return (
    angularDistance(pointVector(first), pointVector(second)) * EARTH_RADIUS_KM
  );
}

export function distanceToGeometryKm(
  point: GeographicPoint,
  geometry: Geometry,
): number {
  return (
    distanceToGeometryRadians(pointVector(point), geometry) * EARTH_RADIUS_KM
  );
}

export function distanceToGeometryCollectionKm(
  point: GeographicPoint,
  collection: GeometryCollectionLike,
): number {
  const pointOnEarth = pointVector(point);
  return (
    Math.min(
      ...collection.features.map((feature) =>
        distanceToGeometryRadians(pointOnEarth, feature.geometry),
      ),
    ) * EARTH_RADIUS_KM
  );
}
