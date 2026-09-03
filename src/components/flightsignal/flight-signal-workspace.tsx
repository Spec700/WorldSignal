"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";

import {
  FlightDossier,
  flightStatusLabels,
} from "@/components/flightsignal/flight-dossier";
import { FlightSignalHeader } from "@/components/flightsignal/flight-signal-header";
import { TrackFlightEditor } from "@/components/flightsignal/track-flight-editor";
import { ResizeHandle } from "@/components/layout/resize-handle";
import { LocalTimestamp } from "@/components/local-timestamp";
import { ProductSwitcher } from "@/components/product-switcher/product-switcher";
import type {
  FlightDisplayStatus,
  FlightSignalDashboardDto,
} from "@/features/flights/types";
import { useElementSize } from "@/hooks/use-element-size";

import styles from "@/app/flightsignal/flightsignal.module.css";

const FlightGlobe = dynamic(
  () =>
    import("@/components/flightsignal/flight-globe").then(
      (module) => module.FlightGlobe,
    ),
  {
    loading: () => (
      <div className="globe-shell" role="status">
        <div className="globe-loading">Preparing flight globe…</div>
      </div>
    ),
    ssr: false,
  },
);

const DEFAULT_QUEUE_WIDTH = 320;
const MIN_QUEUE_WIDTH = 250;
const DEFAULT_DOSSIER_WIDTH = 390;
const MIN_DOSSIER_WIDTH = 320;
const MIN_STAGE_WIDTH = 480;
const DEFAULT_TIMELINE_HEIGHT = 122;
const MIN_TIMELINE_HEIGHT = 88;
const MIN_MAIN_HEIGHT = 400;
const HANDLE_SIZE = 8;
const HEADER_HEIGHT = 64;

type StatusFilter = "all" | "attention" | "active" | "closed";

function isAttentionStatus(status: FlightDisplayStatus) {
  return [
    "match_required",
    "signal_stale",
    "source_error",
    "possible_arrival",
  ].includes(status);
}

function matchesStatus(status: FlightDisplayStatus, filter: StatusFilter) {
  if (filter === "all") return true;
  if (filter === "attention") return isAttentionStatus(status);
  if (filter === "closed")
    return status === "completed" || status === "cancelled";
  return ["awaiting_signal", "live_airborne", "live_ground"].includes(status);
}

function formatRemaining(arrival: string | undefined, nowMs: number | null) {
  if (!arrival || nowMs === null) {
    return "Schedule remaining unavailable";
  }
  const remainingMinutes = Math.ceil((Date.parse(arrival) - nowMs) / 60_000);
  if (remainingMinutes <= 0) {
    return "Scheduled arrival time passed";
  }
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  return `Scheduled ${hours}h ${minutes}m remaining`;
}

export function FlightSignalWorkspace({
  dashboard,
  initialFlightId,
}: {
  dashboard: FlightSignalDashboardDto;
  initialFlightId?: string;
}) {
  const router = useRouter();
  const [shellRef, shellSize] = useElementSize<HTMLDivElement>();
  const [workspaceRef, workspaceSize] = useElementSize<HTMLElement>();
  const [requestedQueueWidth, setRequestedQueueWidth] =
    useState(DEFAULT_QUEUE_WIDTH);
  const [requestedDossierWidth, setRequestedDossierWidth] = useState(
    DEFAULT_DOSSIER_WIDTH,
  );
  const [requestedTimelineHeight, setRequestedTimelineHeight] = useState(
    DEFAULT_TIMELINE_HEIGHT,
  );
  const [selectedFlightId, setSelectedFlightId] = useState<string | undefined>(
    initialFlightId ??
      dashboard.flights.find(
        (flight) =>
          flight.trackingStatus !== "completed" &&
          flight.trackingStatus !== "cancelled",
      )?.id ??
      dashboard.flights[0]?.id,
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [activeOperatorId, setActiveOperatorId] = useState(
    dashboard.operators[0]?.id ?? "",
  );
  const [nowMs, setNowMs] = useState(() => Date.parse(dashboard.generatedAt));
  const selectedFlight = dashboard.flights.find(
    (flight) => flight.id === selectedFlightId,
  );
  const detailOpen = editorOpen || Boolean(selectedFlight);
  const availableWidth = workspaceSize.width || 1440;
  const maximumQueueWidth = Math.max(
    MIN_QUEUE_WIDTH,
    availableWidth -
      (detailOpen ? MIN_DOSSIER_WIDTH + HANDLE_SIZE : 0) -
      MIN_STAGE_WIDTH -
      HANDLE_SIZE,
  );
  const queueWidth = Math.min(requestedQueueWidth, maximumQueueWidth);
  const maximumDossierWidth = Math.max(
    MIN_DOSSIER_WIDTH,
    availableWidth - queueWidth - MIN_STAGE_WIDTH - HANDLE_SIZE * 2,
  );
  const dossierWidth = Math.min(requestedDossierWidth, maximumDossierWidth);
  const maximumTimelineHeight = Math.max(
    MIN_TIMELINE_HEIGHT,
    (shellSize.height || 900) - HEADER_HEIGHT - MIN_MAIN_HEIGHT - HANDLE_SIZE,
  );
  const timelineHeight = Math.min(
    requestedTimelineHeight,
    maximumTimelineHeight,
  );
  const shellStyle = {
    "--flight-queue-width": `${queueWidth}px`,
    "--flight-dossier-width": `${dossierWidth}px`,
    "--flight-timeline-height": `${timelineHeight}px`,
  } as CSSProperties;

  const filteredFlights = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("en-US");
    return dashboard.flights.filter((flight) => {
      const haystack = [
        flight.passengerFlightNumber,
        flight.providerFlightIcao,
        flight.adsbCallsign,
        flight.airlineName,
        flight.origin.iata,
        flight.origin.name,
        flight.destination.iata,
        flight.destination.name,
        ...flight.assignments.map(
          (assignment) => assignment.person.displayName,
        ),
      ]
        .join(" ")
        .toLocaleLowerCase("en-US");
      return (
        (!needle || haystack.includes(needle)) &&
        matchesStatus(flight.displayStatus, statusFilter)
      );
    });
  }, [dashboard.flights, query, statusFilter]);

  const refresh = useCallback(() => router.refresh(), [router]);
  const handleCreated = useCallback(
    (flightInstanceId: string) => {
      setEditorOpen(false);
      setSelectedFlightId(flightInstanceId);
      router.refresh();
    },
    [router],
  );

  useEffect(() => {
    const clock = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    const hasOpenFlights = dashboard.flights.some(
      (flight) =>
        flight.trackingStatus !== "completed" &&
        flight.trackingStatus !== "cancelled",
    );
    if (!hasOpenFlights) {
      return;
    }
    const refreshInterval = window.setInterval(() => router.refresh(), 15_000);
    return () => window.clearInterval(refreshInterval);
  }, [dashboard.flights, router]);

  if (dashboard.setupRequired) {
    return (
      <main className={styles.setupShell}>
        <header className={styles.setupHeader}>
          <ProductSwitcher currentProduct="flightsignal" />
        </header>
        <section className={styles.setupState}>
          <span className={styles.setupMark} aria-hidden="true">
            F
          </span>
          <span className={styles.eyebrow}>Local workspace required</span>
          <h1>Initialize FlightSignal</h1>
          <p>
            PostgreSQL is connected, but the Priority Signals workspace has not
            been seeded.
          </p>
          <pre>
            <code>docker compose up --build</code>
          </pre>
        </section>
      </main>
    );
  }

  return (
    <div className={styles.shell} ref={shellRef} style={shellStyle}>
      <a className="skip-link" href="#flight-stage">
        Skip to tracked flight map
      </a>
      <FlightSignalHeader
        activeOperatorId={activeOperatorId}
        dashboard={dashboard}
        onOperatorChange={setActiveOperatorId}
        onTrackFlight={() => {
          setSelectedFlightId(undefined);
          setEditorOpen(true);
        }}
      />

      <main
        className={`${styles.workspace}${detailOpen ? ` ${styles.hasDetail}` : ""}`}
        ref={workspaceRef}
      >
        <aside aria-label="Tracked flights" className={styles.flightQueue}>
          <header className={styles.queueHeader}>
            <span className={styles.eyebrow}>Assigned travel</span>
            <h1>Flight stream</h1>
            <p>Only operator-assigned, dated flights appear here.</p>
          </header>
          <div className={styles.queueControls}>
            <label className={styles.searchControl}>
              <span className="sr-only">Search tracked flights</span>
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Search tracked flights"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Flight, person, airport…"
                type="search"
                value={query}
              />
            </label>
            <label className={styles.filterControl}>
              <span>Status</span>
              <select
                aria-label="Filter tracked flights"
                onChange={(event) =>
                  setStatusFilter(event.target.value as StatusFilter)
                }
                value={statusFilter}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="attention">Attention</option>
                <option value="closed">Closed</option>
              </select>
            </label>
          </div>
          <ul className={styles.flightList}>
            {filteredFlights.map((flight) => (
              <li
                data-selected={flight.id === selectedFlightId}
                key={flight.id}
              >
                <button
                  aria-pressed={flight.id === selectedFlightId}
                  onClick={() => {
                    setEditorOpen(false);
                    setSelectedFlightId(flight.id);
                  }}
                  type="button"
                >
                  <span className={styles.flightListTopline}>
                    <strong>{flight.passengerFlightNumber}</strong>
                    <span data-status={flight.displayStatus}>
                      {flightStatusLabels[flight.displayStatus]}
                    </span>
                  </span>
                  <span className={styles.routeCode}>
                    {flight.origin.iata} <i aria-hidden="true">→</i>{" "}
                    {flight.destination.iata}
                  </span>
                  <small>
                    {flight.assignments
                      .map((assignment) => assignment.person.displayName)
                      .join(", ")}
                  </small>
                  <time dateTime={flight.scheduledDepartureAt}>
                    <LocalTimestamp timestamp={flight.scheduledDepartureAt} />
                  </time>
                </button>
              </li>
            ))}
          </ul>
          {filteredFlights.length === 0 ? (
            <div className={styles.emptyQueue}>
              <strong>
                {dashboard.flights.length === 0
                  ? "No tracked flights"
                  : "No matching flights"}
              </strong>
              <p>
                {dashboard.flights.length === 0
                  ? "Assign a dated flight to a person to begin source acquisition."
                  : "Change the search or status filter."}
              </p>
              {dashboard.flights.length === 0 ? (
                <button onClick={() => setEditorOpen(true)} type="button">
                  Track first flight
                </button>
              ) : null}
            </div>
          ) : null}
          <footer className={styles.queueFooter}>
            <span>{filteredFlights.length} visible</span>
            <span>ADSB.lol · ODbL</span>
          </footer>
        </aside>

        <ResizeHandle
          label="Resize flight stream"
          max={maximumQueueWidth}
          min={MIN_QUEUE_WIDTH}
          onResize={setRequestedQueueWidth}
          orientation="vertical"
          value={queueWidth}
        />

        <section className={styles.flightStage} id="flight-stage">
          <FlightGlobe flight={selectedFlight} />
          <div className={styles.stageHeading}>
            <span className={styles.eyebrow}>Observed aircraft</span>
            <strong>
              {selectedFlight
                ? `${selectedFlight.passengerFlightNumber} · ${selectedFlight.origin.iata} → ${selectedFlight.destination.iata}`
                : "Select a tracked flight"}
            </strong>
          </div>
          {selectedFlight ? (
            <article className={styles.flightOverlay}>
              <span
                className={styles.flightStatus}
                data-status={selectedFlight.displayStatus}
              >
                {flightStatusLabels[selectedFlight.displayStatus]}
              </span>
              <h2>{selectedFlight.passengerFlightNumber}</h2>
              <p>
                {selectedFlight.assignments
                  .map((assignment) => assignment.person.displayName)
                  .join(", ")}
              </p>
              <strong>
                {formatRemaining(selectedFlight.scheduledArrivalAt, nowMs)}
              </strong>
              <small>
                {selectedFlight.latestObservation
                  ? "Aircraft position from ADSB.lol"
                  : "Route shown from analyst-confirmed itinerary"}
              </small>
            </article>
          ) : null}
          <footer className={styles.stageFooter}>
            <span>NASA imagery · Natural Earth boundaries</span>
            <span>
              Aircraft telemetry: ADSB.lol · person presence requires operator
              confirmation
            </span>
          </footer>
        </section>

        {detailOpen ? (
          <>
            <ResizeHandle
              direction={-1}
              label="Resize flight detail panel"
              max={maximumDossierWidth}
              min={MIN_DOSSIER_WIDTH}
              onResize={setRequestedDossierWidth}
              orientation="vertical"
              value={dossierWidth}
            />
            {editorOpen ? (
              <TrackFlightEditor
                activeOperatorId={activeOperatorId}
                onClose={() => setEditorOpen(false)}
                onCreated={handleCreated}
                people={dashboard.people}
              />
            ) : selectedFlight ? (
              <FlightDossier
                activeOperatorId={activeOperatorId}
                flight={selectedFlight}
                onClose={() => setSelectedFlightId(undefined)}
                onRefresh={refresh}
              />
            ) : null}
          </>
        ) : null}
      </main>

      <ResizeHandle
        direction={-1}
        label="Resize flight timeline"
        max={maximumTimelineHeight}
        min={MIN_TIMELINE_HEIGHT}
        onResize={setRequestedTimelineHeight}
        orientation="horizontal"
        value={timelineHeight}
      />

      <section
        aria-label="Selected flight timeline"
        className={styles.timeline}
      >
        <header>
          <span className={styles.eyebrow}>Flight timeline</span>
          <strong>
            {selectedFlight?.passengerFlightNumber ?? "No flight selected"}
          </strong>
          <small>Schedule is analyst supplied · observations are ADS-B</small>
        </header>
        {selectedFlight ? (
          <ol>
            <li data-kind="schedule">
              <span />
              <small>Scheduled departure</small>
              <strong>{selectedFlight.origin.iata}</strong>
              <time dateTime={selectedFlight.scheduledDepartureAt}>
                <LocalTimestamp
                  timestamp={selectedFlight.scheduledDepartureAt}
                />
              </time>
            </li>
            {selectedFlight.latestObservation ? (
              <li data-kind="observation">
                <span />
                <small>Latest aircraft observation</small>
                <strong>
                  {selectedFlight.latestObservation.onGround
                    ? "On ground"
                    : "Airborne"}
                </strong>
                <time
                  dateTime={selectedFlight.latestObservation.sourceObservedAt}
                >
                  <LocalTimestamp
                    timestamp={
                      selectedFlight.latestObservation.sourceObservedAt
                    }
                  />
                </time>
              </li>
            ) : null}
            <li data-kind="schedule">
              <span />
              <small>Scheduled arrival</small>
              <strong>{selectedFlight.destination.iata}</strong>
              {selectedFlight.scheduledArrivalAt ? (
                <time dateTime={selectedFlight.scheduledArrivalAt}>
                  <LocalTimestamp
                    timestamp={selectedFlight.scheduledArrivalAt}
                  />
                </time>
              ) : (
                <time>Not supplied</time>
              )}
            </li>
          </ol>
        ) : (
          <p>
            Select a flight to inspect its schedule and observed aircraft trail.
          </p>
        )}
      </section>
    </div>
  );
}
