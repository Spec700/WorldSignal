import type { EventBatch, EventCategory, WorldEvent } from "./types";

export interface TimelineTick {
  category: EventCategory;
  eventId: string;
  positionPercent: number;
  timestamp: string;
  title: string;
}

export function eventTimelineTimestamp(event: WorldEvent): string {
  return event.occurredAt ?? event.startAt ?? event.updatedAt;
}

export function createTimelineTicks(
  events: WorldEvent[],
  requestedRange: EventBatch["requestedRange"],
): TimelineTick[] {
  const rangeStart = Date.parse(requestedRange.from);
  const rangeEnd = Date.parse(requestedRange.to);
  const duration = rangeEnd - rangeStart;

  if (
    !Number.isFinite(rangeStart) ||
    !Number.isFinite(rangeEnd) ||
    duration <= 0
  ) {
    return [];
  }

  return events.flatMap((event) => {
    const timestamp = eventTimelineTimestamp(event);
    const eventTime = Date.parse(timestamp);
    if (!Number.isFinite(eventTime) || eventTime > rangeEnd) {
      return [];
    }

    const positionPercent =
      ((Math.max(eventTime, rangeStart) - rangeStart) / duration) * 100;

    return [
      {
        category: event.category,
        eventId: event.id,
        positionPercent,
        timestamp,
        title: event.title,
      },
    ];
  });
}
