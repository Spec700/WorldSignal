import { EventIcon, eventCategoryLabel } from "@/components/event-icon";
import type { WorldEvent } from "@/lib/events/types";
import { formatCoordinate } from "@/lib/time/format";

interface OperationalStageProps {
  hasLoadedBatch: boolean;
  loadedCount: number;
  visibleCount: number;
  hasActiveQuery: boolean;
  refreshError?: string;
  refreshing: boolean;
  batchIsPrevious: boolean;
  selectedEvent?: WorldEvent;
  onRefresh: () => void;
  onClearQuery: () => void;
}

export function OperationalStage({
  hasLoadedBatch,
  loadedCount,
  visibleCount,
  hasActiveQuery,
  refreshError,
  refreshing,
  batchIsPrevious,
  selectedEvent,
  onRefresh,
  onClearQuery,
}: OperationalStageProps) {
  let content;

  if (!hasLoadedBatch && refreshError) {
    content = (
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
    content = (
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
  } else if (selectedEvent) {
    content = (
      <div className="stage-selection" aria-label="Selected event preview">
        <EventIcon category={selectedEvent.category} />
        <span className="stage-kicker">
          Selected · {eventCategoryLabel(selectedEvent.category)}
        </span>
        <h1>{selectedEvent.title}</h1>
        <p>{selectedEvent.locationLabel}</p>
        <div className="coordinate-readout">
          <span>
            {formatCoordinate(selectedEvent.centroid.latitude, "lat")}
          </span>
          <span>
            {formatCoordinate(selectedEvent.centroid.longitude, "lon")}
          </span>
        </div>
        <span className="stage-note">
          Globe focus and the evidence dossier join this synchronized selection
          in the next implementation slices.
        </span>
      </div>
    );
  } else if (loadedCount === 0) {
    content = (
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
    content = (
      <div className="stage-message">
        <span className="stage-kicker">No matching events</span>
        <h1>The active filters hide all loaded events</h1>
        <p>{loadedCount} events remain in the current retrieval.</p>
        {hasActiveQuery ? (
          <button className="stage-action" onClick={onClearQuery} type="button">
            Clear search
          </button>
        ) : null}
      </div>
    );
  } else {
    content = (
      <div className="stage-message stage-message--compact">
        <span className="stage-kicker">Operational set synchronized</span>
        <strong className="stage-count">{visibleCount}</strong>
        <h1>visible hazard events</h1>
        <p>Select any event in the stream to inspect its active focus state.</p>
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
          <small>Globe layer pending A4</small>
        </span>
        <span className="stage-data-state">
          {batchIsPrevious ? "Previous retrieval displayed" : "Manual mode"}
        </span>
      </div>

      <div className="stage-content">{content}</div>

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
