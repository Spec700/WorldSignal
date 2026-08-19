import type { PersonLocationDto } from "@/features/people/types";

function parsedTimestamp(value: string): number | undefined {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function personLocationAt(
  locations: PersonLocationDto[],
  at: string,
): PersonLocationDto | undefined {
  const target = parsedTimestamp(at);
  if (target === undefined) {
    return undefined;
  }

  return locations
    .filter((location) => {
      const start = parsedTimestamp(location.effectiveFrom);
      const end = location.effectiveTo
        ? parsedTimestamp(location.effectiveTo)
        : undefined;

      return (
        start !== undefined &&
        start <= target &&
        (location.effectiveTo === undefined ||
          (end !== undefined && target < end))
      );
    })
    .sort(
      (left, right) =>
        Date.parse(right.effectiveFrom) - Date.parse(left.effectiveFrom),
    )[0];
}

export function currentPersonLocation(
  locations: PersonLocationDto[],
): PersonLocationDto | undefined {
  return locations
    .filter((location) => location.isActive)
    .sort(
      (left, right) =>
        Date.parse(right.effectiveFrom) - Date.parse(left.effectiveFrom),
    )[0];
}
