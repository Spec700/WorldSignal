import type { SourceId, WorldEvent } from "./types";

export type EventChange = "new" | "updated" | "resolved" | "unchanged";

function eventSource(event: WorldEvent): SourceId {
  return event.sources[0].source;
}

export function classifyEventChanges(
  previousEventsById: ReadonlyMap<string, WorldEvent>,
  nextEvents: WorldEvent[],
): Map<string, EventChange> {
  const changes = new Map<string, EventChange>();

  for (const event of nextEvents) {
    const previous = previousEventsById.get(event.id);

    if (!previous) {
      changes.set(event.id, "new");
    } else if (previous.lifecycle !== "ended" && event.lifecycle === "ended") {
      changes.set(event.id, "resolved");
    } else if (previous.revisionFingerprint !== event.revisionFingerprint) {
      changes.set(event.id, "updated");
    } else {
      changes.set(event.id, "unchanged");
    }
  }

  return changes;
}

export function updateSuccessfulSourceBaseline(
  previousEventsById: ReadonlyMap<string, WorldEvent>,
  nextEvents: WorldEvent[],
  successfulSources: ReadonlySet<SourceId>,
): Map<string, WorldEvent> {
  const baseline = new Map(
    [...previousEventsById].filter(
      ([, event]) => !successfulSources.has(eventSource(event)),
    ),
  );

  for (const event of nextEvents) {
    baseline.set(event.id, event);
  }

  return baseline;
}
