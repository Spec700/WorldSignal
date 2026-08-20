import { useMemo } from "react";

import type { EventChange } from "@/lib/events/change-detection";
import { createTimelineTicks } from "@/lib/events/timeline";
import type { EventBatch, HazardWindow, WorldEvent } from "@/lib/events/types";
import { formatLocalTimestamp } from "@/lib/time/format";

interface HazardTimelineProps {
  batch?: EventBatch;
  changesByEventId: ReadonlyMap<string, EventChange>;
  cursor: string;
  events: WorldEvent[];
  refreshing: boolean;
  restoring: boolean;
  visibleEvents: WorldEvent[];
  window: HazardWindow;
  onCursorChange: (cursor: string) => void;
  onWindowChange: (window: HazardWindow) => void;
}

const WINDOWS: Array<{ value: HazardWindow; label: string }> = [
  { value: "24h", label: "24H" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function HazardTimeline({
  batch,
  changesByEventId,
  cursor,
  events,
  refreshing,
  restoring,
  visibleEvents,
  window,
  onCursorChange,
  onWindowChange,
}: HazardTimelineProps) {
  const rangeStart = batch ? Date.parse(batch.requestedRange.from) : 0;
  const rangeEnd = batch ? Date.parse(batch.requestedRange.to) : 0;
  const validRange = Boolean(batch && rangeEnd > rangeStart);
  const parsedCursor = Date.parse(cursor);
  const cursorValue = validRange
    ? clamp(
        Number.isFinite(parsedCursor) ? parsedCursor : rangeEnd,
        rangeStart,
        rangeEnd,
      )
    : 0;
  const ticks = useMemo(
    () => (batch ? createTimelineTicks(events, batch.requestedRange) : []),
    [batch, events],
  );
  const visibleIds = useMemo(
    () => new Set(visibleEvents.map((event) => event.id)),
    [visibleEvents],
  );
  const newCount = visibleEvents.filter(
    (event) => changesByEventId.get(event.id) === "new",
  ).length;
  const changedCount = visibleEvents.filter((event) => {
    const change = changesByEventId.get(event.id);
    return change === "updated" || change === "resolved";
  }).length;

  return (
    <section className="hazard-timeline" aria-label="Loaded hazard timeline">
      <fieldset className="timeline-window-control">
        <legend>Source range</legend>
        <div className="segmented-control">
          {WINDOWS.map((option) => (
            <button
              aria-pressed={window === option.value}
              className={window === option.value ? "is-active" : undefined}
              disabled={refreshing || restoring}
              key={option.value}
              onClick={() => onWindowChange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <small>
          {batch ? "Stored ranges restore locally" : "Used on first load"}
        </small>
      </fieldset>

      <div className="timeline-range">
        <div className="timeline-range-labels" aria-hidden={!batch}>
          <span>
            {batch
              ? formatLocalTimestamp(batch.requestedRange.from)
              : "No loaded range"}
          </span>
          <strong>
            {batch
              ? "Loaded source interval"
              : "Load events to enable time filtering"}
          </strong>
          <span>
            {batch
              ? formatLocalTimestamp(batch.requestedRange.to)
              : "Awaiting retrieval"}
          </span>
        </div>
        <div className="timeline-track">
          <div className="timeline-ticks" aria-hidden="true">
            {ticks.map((tick) => (
              <span
                className={`timeline-tick timeline-tick--${tick.category}${
                  visibleIds.has(tick.eventId) ? " is-visible" : ""
                }`}
                key={tick.eventId}
                style={{ left: `${tick.positionPercent}%` }}
                title={`${tick.title} · ${formatLocalTimestamp(tick.timestamp)}`}
              />
            ))}
          </div>
          <input
            aria-label="Time cursor"
            aria-valuetext={
              validRange
                ? formatLocalTimestamp(
                    new Date(cursorValue).toISOString(),
                    "full",
                  )
                : "No loaded range"
            }
            disabled={!validRange}
            max={validRange ? rangeEnd : 1}
            min={validRange ? rangeStart : 0}
            onChange={(event) =>
              onCursorChange(new Date(Number(event.target.value)).toISOString())
            }
            step={60_000}
            type="range"
            value={cursorValue}
          />
        </div>
      </div>

      <div className="timeline-cursor-summary">
        <span className="timeline-label">Time cursor · local</span>
        <strong>
          {validRange
            ? formatLocalTimestamp(new Date(cursorValue).toISOString(), "full")
            : "Not available"}
        </strong>
        <button
          disabled={!validRange || cursorValue === rangeEnd}
          onClick={() => batch && onCursorChange(batch.requestedRange.to)}
          type="button"
        >
          Now
        </button>
      </div>

      <dl className="timeline-counts" aria-label="Visible event change counts">
        <div>
          <dt>Visible</dt>
          <dd>{visibleEvents.length}</dd>
        </div>
        <div>
          <dt>New</dt>
          <dd>{newCount}</dd>
        </div>
        <div>
          <dt>Changed</dt>
          <dd>{changedCount}</dd>
        </div>
      </dl>
    </section>
  );
}
