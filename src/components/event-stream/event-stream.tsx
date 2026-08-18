import type { KeyboardEvent } from "react";

import { EventIcon, eventCategoryLabel } from "@/components/event-icon";
import type { EventChange } from "@/lib/events/change-detection";
import type { WorldEvent } from "@/lib/events/types";
import { formatEventAge } from "@/lib/time/format";

interface EventStreamProps {
  events: WorldEvent[];
  selectedEventId?: string;
  changesByEventId: ReadonlyMap<string, EventChange>;
  onSelect: (eventId: string) => void;
}

function handleRowKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
    return;
  }

  const list = event.currentTarget.closest("[data-event-stream]");
  const rows = list?.querySelectorAll<HTMLButtonElement>(
    "button[data-event-row]",
  );
  if (!rows || rows.length === 0) {
    return;
  }

  event.preventDefault();
  const currentIndex = [...rows].indexOf(event.currentTarget);
  const nextIndex =
    event.key === "ArrowDown"
      ? Math.min(currentIndex + 1, rows.length - 1)
      : Math.max(currentIndex - 1, 0);
  rows[nextIndex]?.focus();
}

function eventReferenceTime(event: WorldEvent): string {
  return event.updatedAt ?? event.occurredAt ?? event.startAt ?? "";
}

export function EventStream({
  events,
  selectedEventId,
  changesByEventId,
  onSelect,
}: EventStreamProps) {
  if (events.length === 0) {
    return (
      <div className="stream-empty">
        <span className="stream-empty-mark" aria-hidden="true">
          —
        </span>
        <p>No events in the active view.</p>
      </div>
    );
  }

  return (
    <ol className="event-stream" data-event-stream aria-label="Hazard events">
      {events.map((event) => {
        const change = changesByEventId.get(event.id);
        const source = event.sources[0];

        return (
          <li key={event.id}>
            <button
              aria-label={`${eventCategoryLabel(event.category)}: ${event.title}, ${event.displayPriority} priority`}
              aria-pressed={selectedEventId === event.id}
              className="event-row"
              data-event-row
              data-event-id={event.id}
              onClick={() => onSelect(event.id)}
              onKeyDown={handleRowKeyDown}
              type="button"
            >
              <EventIcon category={event.category} />
              <span className="event-row-copy">
                <span className="event-row-heading">
                  <strong>{event.title}</strong>
                  {change && change !== "unchanged" ? (
                    <span className={`change-badge change-badge--${change}`}>
                      {change}
                    </span>
                  ) : null}
                </span>
                <span className="event-location">{event.locationLabel}</span>
                <span className="event-row-meta">
                  <span
                    className={`priority-label priority-label--${event.displayPriority}`}
                  >
                    {event.displayPriority}
                  </span>
                  <span>{event.nativeSeverity.label}</span>
                  <span>{source.source.toUpperCase()}</span>
                  <span>{formatEventAge(eventReferenceTime(event))}</span>
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
