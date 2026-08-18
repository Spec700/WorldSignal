import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import { EventIcon, eventCategoryLabel } from "@/components/event-icon";
import type { WorldEvent } from "@/lib/events/types";
import type { GdacsGeometryCollection } from "@/lib/sources/gdacs/geometry";
import { formatCoordinate } from "@/lib/time/format";

const WorldGlobe = dynamic(
  () =>
    import("@/components/globe/world-globe").then(
      (module) => module.WorldGlobe,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="globe-module-loading" role="status">
        Loading local globe renderer…
      </div>
    ),
  },
);

interface OperationalStageProps {
  events: WorldEvent[];
  hasLoadedBatch: boolean;
  loadedCount: number;
  visibleCount: number;
  refreshError?: string;
  refreshing: boolean;
  batchIsPrevious: boolean;
  selectedEvent?: WorldEvent;
  selectedGeometry?: GdacsGeometryCollection;
  selectionNotice?: string;
  onRefresh: () => void;
  onClearFilters: () => void;
  onSelect: (eventId: string) => void;
  onClearSelection: () => void;
}

export function OperationalStage({
  events,
  hasLoadedBatch,
  loadedCount,
  visibleCount,
  refreshError,
  refreshing,
  batchIsPrevious,
  selectedEvent,
  selectedGeometry,
  selectionNotice,
  onRefresh,
  onClearFilters,
  onSelect,
  onClearSelection,
}: OperationalStageProps) {
  let overlay: ReactNode = null;

  if (!hasLoadedBatch && refreshError) {
    overlay = (
      <div className="stage-message stage-message--error" role="alert">
        <span className="stage-kicker">Retrieval failed</span>
        <h1>No current hazard data is available</h1>
        <p>{refreshError}</p>
        <button className="stage-action" onClick={onRefresh} type="button">
          Try manual refresh
        </button>
      </div>
    );
  } else if (!hasLoadedBatch) {
    overlay = (
      <div className="stage-message">
        <span className="stage-kicker">Manual source retrieval</span>
        <h1>Build the current hazard picture</h1>
        <p>
          WorldSignal has not contacted USGS or GDACS. Load the selected range
          when you are ready; no polling will follow.
        </p>
        <button
          className="stage-action"
          disabled={refreshing}
          onClick={onRefresh}
          type="button"
        >
          {refreshing ? "Contacting sources…" : "Load current events"}
        </button>
      </div>
    );
  } else if (loadedCount === 0) {
    overlay = (
      <div className="stage-message">
        <span className="stage-kicker">Retrieval complete</span>
        <h1>No hazards were returned</h1>
        <p>
          Both source states remain visible at left. This is a successful empty
          retrieval, not an “all clear” claim.
        </p>
      </div>
    );
  } else if (visibleCount === 0) {
    overlay = (
      <div className="stage-message">
        <span className="stage-kicker">No matching events</span>
        <h1>The active filters hide all loaded events</h1>
        <p>{loadedCount} events remain in the current retrieval.</p>
        <button className="stage-action" onClick={onClearFilters} type="button">
          Clear filters
        </button>
      </div>
    );
  }

  return (
    <main
      aria-busy={refreshing}
      aria-label="Global hazard operational view"
      className={`operational-stage${refreshing ? " is-refreshing" : ""}`}
      id="main-content"
    >
      <div className="stage-toolbar">
        <span>
          <strong>Global view</strong>
          <small>Local imagery · interactive 3D</small>
        </span>
        <span className="stage-data-state">
          {batchIsPrevious
            ? "Previous retrieval displayed"
            : hasLoadedBatch
              ? `${visibleCount} visible events`
              : "Manual mode"}
        </span>
      </div>

      <div className="stage-content">
        <WorldGlobe
          events={events}
          onClearSelection={onClearSelection}
          onSelect={onSelect}
          selectedGeometry={selectedGeometry}
          selectedEvent={selectedEvent}
        />
        {overlay}

        {selectionNotice ? (
          <div className="stage-selection-notice" role="status">
            {selectionNotice}
          </div>
        ) : null}

        {selectedEvent && !overlay ? (
          <div
            className="globe-selection-chip"
            aria-label="Selected event preview"
          >
            <EventIcon category={selectedEvent.category} />
            <span>
              <small>
                Focused · {eventCategoryLabel(selectedEvent.category)}
              </small>
              <strong>{selectedEvent.title}</strong>
              <span>
                {formatCoordinate(selectedEvent.centroid.latitude, "lat")} ·{" "}
                {formatCoordinate(selectedEvent.centroid.longitude, "lon")}
              </span>
            </span>
          </div>
        ) : null}
      </div>

      {refreshError && hasLoadedBatch ? (
        <div className="stage-warning" role="alert">
          <strong>Latest retrieval failed.</strong> {refreshError} Previous
          events remain visible and are not labeled current.
        </div>
      ) : null}

      <div className="stage-credits">
        <span>Imagery: NASA Blue Marble</span>
        <span>Boundaries: Natural Earth</span>
        <span>Hazard data: USGS · GDACS</span>
      </div>
    </main>
  );
}
