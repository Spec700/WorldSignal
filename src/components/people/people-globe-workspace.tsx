"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { ResizeHandle } from "@/components/layout/resize-handle";
import { HomeHeader } from "@/components/people/home-header";
import { toPersonGlobePoints } from "@/components/people/person-globe-model";
import { ProductSwitcher } from "@/components/product-switcher/product-switcher";
import type { PeopleDashboardDto } from "@/features/people/types";
import { useElementSize } from "@/hooks/use-element-size";

import styles from "@/app/home/home.module.css";

const PeopleGlobe = dynamic(
  () =>
    import("@/components/people/people-globe").then(
      (module) => module.PeopleGlobe,
    ),
  {
    loading: () => (
      <div className="globe-shell" role="status">
        <div className="globe-loading">Preparing people map…</div>
      </div>
    ),
    ssr: false,
  },
);

interface PeopleGlobeWorkspaceProps {
  dashboard: PeopleDashboardDto;
  initialPersonId?: string;
}

const DEFAULT_GLOBE_ROSTER_WIDTH = 300;
const COMPACT_GLOBE_ROSTER_WIDTH = 250;
const MIN_GLOBE_ROSTER_WIDTH = 240;
const MIN_GLOBE_STAGE_WIDTH = 480;
const RESIZE_HANDLE_SIZE = 8;
const COMPACT_LAYOUT_BREAKPOINT = 900;

export function PeopleGlobeWorkspace({
  dashboard,
  initialPersonId,
}: PeopleGlobeWorkspaceProps) {
  const router = useRouter();
  const [workspaceRef, workspaceSize] = useElementSize<HTMLElement>();
  const [requestedRosterWidth, setRequestedRosterWidth] = useState(
    DEFAULT_GLOBE_ROSTER_WIDTH,
  );
  const [activeOperatorId, setActiveOperatorId] = useState(
    dashboard.operators[0]?.id ?? "",
  );
  const [selectedPersonId, setSelectedPersonId] = useState(initialPersonId);
  const points = useMemo(
    () => toPersonGlobePoints(dashboard.people, undefined, true),
    [dashboard.people],
  );
  const mappedPeople = useMemo(() => {
    const peopleById = new Map(
      dashboard.people.map((person) => [person.id, person]),
    );
    return points.flatMap((point) => {
      const person = peopleById.get(point.id);
      return person ? [{ person, point }] : [];
    });
  }, [dashboard.people, points]);
  const selectedEntry = mappedPeople.find(
    ({ person }) => person.id === selectedPersonId,
  );
  const maximumRosterWidth = Math.max(
    MIN_GLOBE_ROSTER_WIDTH,
    (workspaceSize.width || 1440) - MIN_GLOBE_STAGE_WIDTH - RESIZE_HANDLE_SIZE,
  );
  const rosterWidth =
    workspaceSize.width > 0 && workspaceSize.width <= COMPACT_LAYOUT_BREAKPOINT
      ? COMPACT_GLOBE_ROSTER_WIDTH
      : Math.min(requestedRosterWidth, maximumRosterWidth);
  const workspaceStyle = {
    "--globe-roster-width": `${rosterWidth}px`,
  } as CSSProperties;

  useEffect(() => {
    if (dashboard.metrics.traveling === 0) {
      return;
    }
    const refreshInterval = window.setInterval(() => router.refresh(), 15_000);
    return () => window.clearInterval(refreshInterval);
  }, [dashboard.metrics.traveling, router]);

  if (dashboard.setupRequired) {
    return (
      <main className={styles.setupShell}>
        <header className={styles.setupHeader}>
          <ProductSwitcher currentProduct="home" />
        </header>
        <section className={styles.setupState}>
          <span className={styles.setupMark} aria-hidden="true">
            P
          </span>
          <span className={styles.eyebrow}>Local workspace required</span>
          <h1>Initialize the priority roster</h1>
          <p>
            PostgreSQL is connected, but the synthetic demo workspace has not
            been seeded.
          </p>
          <pre>
            <code>npm run db:migrate{"\n"}npm run db:seed</code>
          </pre>
        </section>
      </main>
    );
  }

  return (
    <div className={styles.shell}>
      <a className="skip-link" href="#people-globe-main">
        Skip to people location map
      </a>
      <HomeHeader
        activeOperatorId={activeOperatorId}
        currentView="globe"
        metrics={dashboard.metrics}
        onAddPerson={() => router.push("/home?create=1")}
        onOperatorChange={setActiveOperatorId}
        operators={dashboard.operators}
      />

      <main
        className={styles.globeWorkspace}
        id="people-globe-main"
        ref={workspaceRef}
        style={workspaceStyle}
      >
        <aside
          aria-label="People with approved locations and confirmed travel"
          className={styles.globeRoster}
        >
          <header>
            <span className={styles.eyebrow}>Approved + confirmed travel</span>
            <h1>People globe</h1>
            <p>
              Approved locations stay intact while confirmed travelers follow
              their observed aircraft.
            </p>
          </header>

          <div className={styles.globeRosterSummary}>
            <strong>{mappedPeople.length}</strong>
            <span>active people mapped</span>
          </div>

          <ul className={styles.globePersonList}>
            {mappedPeople.map(({ person, point }) => (
              <li
                data-selected={person.id === selectedPersonId}
                key={person.id}
              >
                <button
                  aria-pressed={person.id === selectedPersonId}
                  onClick={() => setSelectedPersonId(person.id)}
                  type="button"
                >
                  <span
                    className={styles.mapMarker}
                    data-tier={person.tier}
                    data-stale={Boolean(
                      person.activeTravel?.sourceError ||
                      person.activeTravel?.position?.isStale,
                    )}
                    data-traveling={Boolean(person.activeTravel)}
                  >
                    {person.activeTravel ? "✈" : null}
                  </span>
                  <span>
                    <strong>{person.displayName}</strong>
                    <small>
                      {person.activeTravel
                        ? person.activeTravel.position
                          ? `${person.activeTravel.passengerFlightNumber} · ${person.activeTravel.origin.iata} → ${person.activeTravel.destination.iata}${person.activeTravel.sourceError ? " · source unavailable" : person.activeTravel.position.isStale ? " · stale position" : ""}`
                          : `${person.activeTravel.passengerFlightNumber} · awaiting aircraft position`
                        : point.locationLabel}
                    </small>
                  </span>
                  <em>{person.activeTravel ? "Travel" : person.tier}</em>
                </button>
              </li>
            ))}
          </ul>

          <section
            className={styles.globeLegend}
            aria-label="Protection tier legend"
          >
            <span>Protection tier</span>
            <p>
              <i data-tier="standard" /> Standard
            </p>
            <p>
              <i data-tier="high" /> High
            </p>
            <p>
              <i data-tier="critical" /> Critical
            </p>
          </section>
          <footer>
            Aircraft presence is inferred only after onboard confirmation
          </footer>
        </aside>

        <ResizeHandle
          label="Resize people globe roster"
          max={maximumRosterWidth}
          min={MIN_GLOBE_ROSTER_WIDTH}
          onResize={setRequestedRosterWidth}
          orientation="vertical"
          value={rosterWidth}
        />

        <section
          className={styles.peopleGlobeStage}
          aria-label="People location globe"
        >
          <PeopleGlobe
            onClearSelection={() => setSelectedPersonId(undefined)}
            onSelect={setSelectedPersonId}
            people={dashboard.people}
            selectedPersonId={selectedPersonId}
          />

          <div className={styles.globeStageLabel}>
            <span className={styles.eyebrow}>Global presence</span>
            <strong>
              {mappedPeople.length} mapped · {dashboard.metrics.traveling}{" "}
              traveling
            </strong>
          </div>

          {selectedEntry ? (
            <article
              className={styles.personMapCard}
              data-tier={selectedEntry.person.tier}
            >
              <button
                aria-label="Close selected person"
                onClick={() => setSelectedPersonId(undefined)}
                type="button"
              >
                ×
              </button>
              <span className={styles.eyebrow}>
                {selectedEntry.person.activeTravel
                  ? "Selected traveler"
                  : "Selected person"}
              </span>
              <h2>{selectedEntry.person.displayName}</h2>
              <p>
                {selectedEntry.person.organization ?? "Independent"} ·{" "}
                {selectedEntry.person.activeTravel
                  ? selectedEntry.person.activeTravel.position
                    ? `${selectedEntry.person.activeTravel.passengerFlightNumber} aircraft position`
                    : `${selectedEntry.person.activeTravel.passengerFlightNumber} · position pending`
                  : selectedEntry.point.locationLabel}
              </p>
              <dl>
                <div>
                  <dt>Tier</dt>
                  <dd>{selectedEntry.person.tier}</dd>
                </div>
                <div>
                  <dt>Mode</dt>
                  <dd>
                    {selectedEntry.person.activeTravel
                      ? selectedEntry.person.activeTravel.sourceError
                        ? "Travel · source error"
                        : selectedEntry.person.activeTravel.position?.isStale
                          ? "Travel · stale"
                          : "Travel · current"
                      : selectedEntry.point.locationPrecision}
                  </dd>
                </div>
              </dl>
              {selectedEntry.person.activeTravel ? (
                <Link
                  href={`/flightsignal?flight=${selectedEntry.person.activeTravel.flightInstanceId}`}
                >
                  Open {selectedEntry.person.activeTravel.passengerFlightNumber}{" "}
                  →
                </Link>
              ) : null}
              <Link href={`/home?person=${selectedEntry.person.id}`}>
                Open person dossier →
              </Link>
            </article>
          ) : null}

          <footer className={styles.globeStageFooter}>
            <span>
              Approved locations · confirmed travel uses ADS-B aircraft
              positions
            </span>
            <span>Synthetic demonstration data only</span>
          </footer>
        </section>
      </main>
    </div>
  );
}
