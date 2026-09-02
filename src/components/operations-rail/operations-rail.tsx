import { useState, type CSSProperties, type RefObject } from "react";

import { EventIcon, eventCategoryLabel } from "@/components/event-icon";
import { EventStream } from "@/components/event-stream/event-stream";
import { ResizeHandle } from "@/components/layout/resize-handle";
import { SourceHealth } from "@/components/source-health/source-health";
import { useElementSize } from "@/hooks/use-element-size";
import type { EventChange } from "@/lib/events/change-detection";
import type {
  DisplayPriority,
  EventCategory,
  EventFilters,
  EventLifecycle,
  SourceHealth as SourceHealthRecord,
  WorldEvent,
} from "@/lib/events/types";

interface OperationsRailProps {
  categoryCounts: ReadonlyMap<EventCategory, number>;
  filters: EventFilters;
  events: WorldEvent[];
  selectedEventId?: string;
  changesByEventId: ReadonlyMap<string, EventChange>;
  sourceHealth: SourceHealthRecord[];
  refreshing: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onCategoryToggle: (category: EventCategory) => void;
  onLifecycleToggle: (lifecycle: EventLifecycle) => void;
  onPriorityToggle: (priority: DisplayPriority) => void;
  onQueryChange: (query: string) => void;
  onSelect: (eventId: string) => void;
  onSourceToggle: (source: EventFilters["sources"][number]) => void;
}

const CATEGORIES: EventCategory[] = [
  "earthquake",
  "tropical-cyclone",
  "flood",
  "drought",
  "tornado",
  "volcano",
  "wildfire",
];

const PRIORITIES: DisplayPriority[] = ["critical", "high", "medium", "low"];

const SOURCES: Array<{
  value: EventFilters["sources"][number];
  label: string;
}> = [
  { value: "usgs", label: "USGS" },
  { value: "gdacs", label: "GDACS" },
  { value: "spc", label: "NOAA SPC" },
];

const LIFECYCLES: Array<{ value: EventLifecycle; label: string }> = [
  { value: "ongoing", label: "Ongoing" },
  { value: "occurred", label: "Occurred" },
  { value: "ended", label: "Ended" },
  { value: "unknown", label: "Unknown" },
];

const DEFAULT_STREAM_HEIGHT = 280;
const MIN_STREAM_HEIGHT = 110;
const MIN_CONTROLS_HEIGHT = 180;
const RESIZE_HANDLE_SIZE = 8;

export function OperationsRail({
  categoryCounts,
  filters,
  events,
  selectedEventId,
  changesByEventId,
  sourceHealth,
  refreshing,
  searchInputRef,
  onCategoryToggle,
  onLifecycleToggle,
  onPriorityToggle,
  onQueryChange,
  onSelect,
  onSourceToggle,
}: OperationsRailProps) {
  const [requestedStreamHeight, setRequestedStreamHeight] = useState(
    DEFAULT_STREAM_HEIGHT,
  );
  const [railRef, railSize] = useElementSize<HTMLElement>();
  const maxStreamHeight =
    railSize.height > 0
      ? Math.max(
          MIN_STREAM_HEIGHT,
          railSize.height - MIN_CONTROLS_HEIGHT - RESIZE_HANDLE_SIZE,
        )
      : DEFAULT_STREAM_HEIGHT * 2;
  const streamHeight = Math.min(requestedStreamHeight, maxStreamHeight);
  const railStyle = {
    "--event-stream-height": `${streamHeight}px`,
  } as CSSProperties;

  return (
    <aside
      className="operations-rail"
      aria-label="Event controls and stream"
      ref={railRef}
      style={railStyle}
    >
      <div className="operations-rail-controls">
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
              value={filters.query}
            />
          </div>
        </div>

        <section className="rail-filters" aria-labelledby="filters-heading">
          <div className="rail-section-heading">
            <h2 id="filters-heading">Filters</h2>
            <span>Local</span>
          </div>

          <fieldset className="category-filters">
            <legend>Category</legend>
            <div className="category-filter-grid">
              {CATEGORIES.map((category) => (
                <button
                  aria-label={`${eventCategoryLabel(category)}, ${categoryCounts.get(category) ?? 0} at current time`}
                  aria-pressed={filters.categories.includes(category)}
                  key={category}
                  onClick={() => onCategoryToggle(category)}
                  type="button"
                >
                  <EventIcon category={category} />
                  <span>{eventCategoryLabel(category)}</span>
                  <strong>{categoryCounts.get(category) ?? 0}</strong>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="priority-filters">
            <legend>Display priority</legend>
            <div>
              {PRIORITIES.map((priority) => (
                <button
                  aria-pressed={filters.priorities.includes(priority)}
                  className={`priority-filter priority-filter--${priority}`}
                  key={priority}
                  onClick={() => onPriorityToggle(priority)}
                  type="button"
                >
                  <span aria-hidden="true" />
                  {priority}
                </button>
              ))}
            </div>
          </fieldset>

          <details className="advanced-filters">
            <summary>Source &amp; lifecycle</summary>
            <fieldset>
              <legend>Source</legend>
              <div className="compact-filter-buttons">
                {SOURCES.map((source) => (
                  <button
                    aria-pressed={filters.sources.includes(source.value)}
                    key={source.value}
                    onClick={() => onSourceToggle(source.value)}
                    type="button"
                  >
                    {source.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Lifecycle</legend>
              <div className="compact-filter-buttons compact-filter-buttons--lifecycle">
                {LIFECYCLES.map((lifecycle) => (
                  <button
                    aria-pressed={filters.lifecycle.includes(lifecycle.value)}
                    key={lifecycle.value}
                    onClick={() => onLifecycleToggle(lifecycle.value)}
                    type="button"
                  >
                    {lifecycle.label}
                  </button>
                ))}
              </div>
            </fieldset>
          </details>
        </section>

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
      </div>

      <ResizeHandle
        direction={-1}
        label="Resize event stream"
        max={maxStreamHeight}
        min={MIN_STREAM_HEIGHT}
        onResize={setRequestedStreamHeight}
        orientation="horizontal"
        value={streamHeight}
      />

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
