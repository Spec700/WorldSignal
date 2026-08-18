import type { EventFilters, WorldEvent } from "./types";

function eventTimestamp(event: WorldEvent): string {
  return event.occurredAt ?? event.startAt ?? event.updatedAt;
}

function isVisibleAtCursor(event: WorldEvent, cursor: string): boolean {
  if (!cursor) {
    return true;
  }

  const cursorTime = Date.parse(cursor);
  const startTime = Date.parse(eventTimestamp(event));

  if (
    !Number.isFinite(cursorTime) ||
    !Number.isFinite(startTime) ||
    startTime > cursorTime
  ) {
    return false;
  }

  if (event.startAt && event.endedAt) {
    return cursorTime <= Date.parse(event.endedAt);
  }

  return true;
}

function matchesQuery(event: WorldEvent, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const haystack = [
    event.title,
    event.locationLabel,
    event.category,
    event.subtype,
    ...event.countryCodes,
    ...event.sources.map((source) => source.label),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();

  return haystack.includes(normalizedQuery);
}

export function selectVisibleEvents(
  events: WorldEvent[],
  filters: EventFilters,
): WorldEvent[] {
  return selectEventsBeforeTimeCursor(events, filters).filter((event) =>
    isVisibleAtCursor(event, filters.timeCursor),
  );
}

export function selectEventsBeforeTimeCursor(
  events: WorldEvent[],
  filters: EventFilters,
): WorldEvent[] {
  return events.filter(
    (event) =>
      event.module === filters.module &&
      filters.categories.includes(event.category) &&
      filters.priorities.includes(event.displayPriority) &&
      filters.sources.some((source) =>
        event.sources.some((reference) => reference.source === source),
      ) &&
      filters.lifecycle.includes(event.lifecycle) &&
      matchesQuery(event, filters.query),
  );
}
