import { personLocationAt } from "@/features/people/location-model";
import type { PersonDto, PersonTier } from "@/features/people/types";

const tierColor: Record<PersonTier, string> = {
  standard: "#69d2df",
  high: "#f2c46d",
  critical: "#f2f7f8",
};

const tierRadius: Record<PersonTier, number> = {
  standard: 0.22,
  high: 0.27,
  critical: 0.32,
};

export interface PersonGlobePoint {
  kind: "person";
  id: string;
  latitude: number;
  longitude: number;
  color: string;
  radius: number;
  altitude: number;
  displayName: string;
  organization?: string;
  locationLabel: string;
  locationPrecision: string;
  tier: PersonTier;
}

export function toPersonGlobePoints(
  people: PersonDto[],
  atTimestamp?: string,
): PersonGlobePoint[] {
  return people.flatMap((person) => {
    if (person.status !== "active") {
      return [];
    }
    const location = atTimestamp
      ? personLocationAt(person.locationHistory, atTimestamp)
      : person.location;

    if (!location) {
      return [];
    }

    return [
      {
        kind: "person" as const,
        id: person.id,
        latitude: location.latitude,
        longitude: location.longitude,
        color: tierColor[person.tier],
        radius: tierRadius[person.tier],
        altitude: 0.014,
        displayName: person.displayName,
        organization: person.organization,
        locationLabel: location.label,
        locationPrecision: location.precision,
        tier: person.tier,
      },
    ];
  });
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character] ?? character,
  );
}

export function personPointTooltip(point: PersonGlobePoint): string {
  const tier = escapeHtml(point.tier);
  const name = escapeHtml(point.displayName);
  const location = escapeHtml(point.locationLabel);
  const organization = point.organization
    ? ` · ${escapeHtml(point.organization)}`
    : "";

  return `<div class="globe-tooltip"><span>Person · ${tier} protection tier</span><strong>${name}</strong><small>${location}${organization}</small></div>`;
}
