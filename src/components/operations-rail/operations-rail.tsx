import type { RefObject } from "react";

import { EventStream } from "@/components/event-stream/event-stream";
import { SourceHealth } from "@/components/source-health/source-health";
import type { EventChange } from "@/lib/events/change-detection";
import type {
  HazardWindow,
  SourceHealth as SourceHealthRecord,
  WorldEvent,
} from "@/lib/events/types";

interface OperationsRailProps {
  query: string;
  window: HazardWindow;
  events: WorldEvent[];
  selectedEventId?: string;
  changesByEventId: ReadonlyMap<string, EventChange>;
  sourceHealth: SourceHealthRecord[];
  refreshing: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onQueryChange: (query: string) => void;
  onWindowChange: (window: HazardWindow) => void;
  onSelect: (eventId: string) => void;
}

const WINDOWS: Array<{ value: HazardWindow; label: string }> = [
  { value: "24h", label: "24H" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
];

export function OperationsRail({
  query,
  window,
  events,
  selectedEventId,
  changesByEventId,
  sourceHealth,
  refreshing,
  searchInputRef,
  onQueryChange,
  onWindowChange,
  onSelect,
}: OperationsRailProps) {
  return (
    <aside className="operations-rail" aria-label="Event controls and stream">
      <nav className="module-nav" aria-label="WorldSignal modules">
        <span className="rail-section-label">Active layer</span>
        <button className="module-button module-button--active" type="button">
          <span className="module-button-mark" aria-hidden="true">
            NH
          </span>
          <span>
            <strong>Natural Hazards</strong>
            <small>Authoritative global sources</small>
          </span>
          <span className="module-state">Active</span>
        </button>
      </nav>

      <div className="rail-control-group">
        <label className="search-label" htmlFor="event-search">
          Search loaded events
          <span className="shortcut-hint" aria-hidden="true">
            /
          </span>
        </label>
        <div className="search-field">
          <span aria-hidden="true">⌕</span>
          <input
            id="event-search"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Place, category, source…"
            ref={searchInputRef}
            type="search"
            value={query}
          />
        </div>
      </div>

      <fieldset className="window-control">
        <legend>Retrieval window</legend>
        <div className="segmented-control">
          {WINDOWS.map((option) => (
            <button
              aria-pressed={window === option.value}
              className={window === option.value ? "is-active" : undefined}
              key={option.value}
              onClick={() => onWindowChange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <section
        className="source-health-section"
        aria-labelledby="sources-heading"
      >
        <div className="rail-section-heading">
          <h2 id="sources-heading">Source status</h2>
          <span>Manual</span>
        </div>
        <SourceHealth health={sourceHealth} refreshing={refreshing} />
      </section>

      <section className="stream-section" aria-labelledby="stream-heading">
        <div className="rail-section-heading stream-heading">
          <h2 id="stream-heading">Event stream</h2>
          <span>{events.length} visible</span>
        </div>
        <EventStream
          changesByEventId={changesByEventId}
          events={events}
          onSelect={onSelect}
          selectedEventId={selectedEventId}
        />
      </section>
    </aside>
  );
}
