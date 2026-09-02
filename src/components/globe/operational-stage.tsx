import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";

import { EventIcon, eventCategoryLabel } from "@/components/event-icon";
import { ResizeHandle } from "@/components/layout/resize-handle";
import { LocalTimestamp } from "@/components/local-timestamp";
import type { PersonGlobePoint } from "@/components/people/person-globe-model";
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
  people: PersonGlobePoint[];
  hasLoadedBatch: boolean;
  loadedCount: number;
  matchingBeforeTimeCount: number;
  visibleCount: number;
  refreshError?: string;
  refreshing: boolean;
  restoring: boolean;
  batchIsPrevious: boolean;
  selectedEvent?: WorldEvent;
  selectedPerson?: PersonGlobePoint;
  selectedGeometry?: GdacsGeometryCollection;
  selectionNotice?: string;
  onRefresh: () => void;
  onClearFilters: () => void;
  onSelect: (eventId: string) => void;
  onSelectPerson: (personId: string) => void;
  onClearSelection: () => void;
  timeCursor: string;
}

const DEFAULT_PEOPLE_PANEL_WIDTH = 238;
const MIN_PEOPLE_PANEL_WIDTH = 210;
const MAX_PEOPLE_PANEL_WIDTH = 420;
const DEFAULT_PEOPLE_PANEL_HEIGHT = 310;
const MIN_PEOPLE_PANEL_HEIGHT = 170;
const MAX_PEOPLE_PANEL_HEIGHT = 520;

function PeoplePresencePanel({
  people,
  selectedPersonId,
  timeCursor,
  onSelect,
}: {
  people: PersonGlobePoint[];
  selectedPersonId?: string;
  timeCursor: string;
  onSelect: (personId: string) => void;
}) {
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PEOPLE_PANEL_WIDTH);
  const [panelHeight, setPanelHeight] = useState(DEFAULT_PEOPLE_PANEL_HEIGHT);
  const panelStyle = {
    "--people-panel-height": `${panelHeight}px`,
    "--people-panel-width": `${panelWidth}px`,
  } as CSSProperties;

  return (
    <aside
      className="world-people-presence"
      aria-label="People presence layer"
      style={panelStyle}
    >
      <ResizeHandle
        direction={-1}
        label="Resize people panel width"
        max={MAX_PEOPLE_PANEL_WIDTH}
        min={MIN_PEOPLE_PANEL_WIDTH}
        onResize={setPanelWidth}
        orientation="vertical"
        value={panelWidth}
      />
      <ResizeHandle
        label="Resize people panel height"
        max={MAX_PEOPLE_PANEL_HEIGHT}
        min={MIN_PEOPLE_PANEL_HEIGHT}
        onResize={setPanelHeight}
        orientation="horizontal"
        value={panelHeight}
      />
      <header>
        <span>
          <strong>People presence</strong>
          <small>
            {timeCursor ? (
              <>
                At <LocalTimestamp timestamp={timeCursor} />
              </>
            ) : (
              "Current approved locations"
            )}
          </small>
        </span>
        <em>{people.length}</em>
      </header>
      {people.length > 0 ? (
        <ul>
          {people.map((person) => (
            <li data-selected={person.id === selectedPersonId} key={person.id}>
              <button
                aria-pressed={person.id === selectedPersonId}
                onClick={() => onSelect(person.id)}
                type="button"
              >
                <i data-tier={person.tier} aria-hidden="true" />
                <span>
                  <strong>{person.displayName}</strong>
                  <small>{person.locationLabel}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>No approved person locations apply at this cursor.</p>
      )}
      <footer>
        <span>Protection tier markers</span>
        <Link href="/home/globe">Open People globe →</Link>
      </footer>
    </aside>
  );
}

export function OperationalStage({
  events,
  people,
  hasLoadedBatch,
  loadedCount,
  matchingBeforeTimeCount,
  visibleCount,
  refreshError,
  refreshing,
  restoring,
  batchIsPrevious,
  selectedEvent,
  selectedPerson,
  selectedGeometry,
  selectionNotice,
  onRefresh,
  onClearFilters,
  onSelect,
  onSelectPerson,
  onClearSelection,
  timeCursor,
}: OperationalStageProps) {
  let overlay: ReactNode = null;

  if (!hasLoadedBatch && restoring) {
    overlay = (
      <div className="stage-message">
        <span className="stage-kicker">Browser snapshot</span>
        <h1>Restoring the latest hazard picture</h1>
        <p>
          WorldSignal is checking this browser before contacting any hazard
          source.
        </p>
      </div>
    );
  } else if (!hasLoadedBatch && refreshError) {
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
          WorldSignal has not contacted USGS, GDACS, or NOAA SPC. Load the
          selected range when you are ready; no polling will follow.
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
          Each source state remains visible at left. This is a successful empty
          retrieval, not an “all clear” claim.
        </p>
      </div>
    );
  } else if (visibleCount === 0) {
    overlay =
      matchingBeforeTimeCount > 0 ? (
        <div className="stage-message">
          <span className="stage-kicker">No events at this time</span>
          <h1>Matching events exist elsewhere in the loaded interval</h1>
          <p>
            {matchingBeforeTimeCount} matching event
            {matchingBeforeTimeCount === 1 ? " is" : "s are"} outside the
            current time cursor. Move the timeline to inspect when they were
            active.
          </p>
        </div>
      ) : (
        <div className="stage-message">
          <span className="stage-kicker">No matching events</span>
          <h1>The active filters hide all loaded events</h1>
          <p>{loadedCount} events remain in the current retrieval.</p>
          <button
            className="stage-action"
            onClick={onClearFilters}
            type="button"
          >
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
              ? `${visibleCount} visible events · ${people.length} people`
              : `Manual mode · ${people.length} people`}
        </span>
      </div>

      <div className="stage-content">
        <WorldGlobe
          events={events}
          onClearSelection={onClearSelection}
          onSelect={onSelect}
          onSelectPerson={onSelectPerson}
          people={people}
          selectedGeometry={selectedGeometry}
          selectedEvent={selectedEvent}
          selectedPerson={selectedPerson}
        />
        {overlay}

        <PeoplePresencePanel
          onSelect={onSelectPerson}
          people={people}
          selectedPersonId={selectedPerson?.id}
          timeCursor={timeCursor}
        />

        {selectionNotice ? (
          <div className="stage-selection-notice" role="status">
            {selectionNotice}
          </div>
        ) : null}

        {selectedEvent && !overlay ? (
          <div
            className="globe-selection-chip"
            aria-label="Selected event preview"
            role="status"
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

        {selectedPerson ? (
          <div
            className="globe-selection-chip globe-selection-chip--person"
            aria-label="Selected person preview"
            role="status"
          >
            <span data-tier={selectedPerson.tier} aria-hidden="true">
              P
            </span>
            <span>
              <small>Focused · {selectedPerson.tier} protection tier</small>
              <strong>{selectedPerson.displayName}</strong>
              <span>
                {selectedPerson.locationLabel} ·{" "}
                {selectedPerson.organization ?? "Independent"}
              </span>
              <Link href={`/home?person=${selectedPerson.id}`}>
                Open person dossier →
              </Link>
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
        <a
          href="https://earthobservatory.nasa.gov/features/BlueMarble/BlueMarble.php"
          rel="noopener noreferrer"
          target="_blank"
        >
          Imagery: NASA
        </a>
        <a
          href="https://www.naturalearthdata.com/about/terms-of-use/"
          rel="noopener noreferrer"
          target="_blank"
        >
          Boundaries: Natural Earth
        </a>
        <span>
          Hazard data:{" "}
          <a
            href="https://earthquake.usgs.gov/earthquakes/feed/"
            rel="noopener noreferrer"
            target="_blank"
          >
            USGS
          </a>{" "}
          ·{" "}
          <a
            href="https://www.gdacs.org/gdacsapi/swagger/index.html"
            rel="noopener noreferrer"
            target="_blank"
          >
            GDACS
          </a>{" "}
          ·{" "}
          <a
            href="https://www.spc.noaa.gov/climo/reports/"
            rel="noopener noreferrer"
            target="_blank"
          >
            NOAA SPC
          </a>
        </span>
      </div>
    </main>
  );
}
