"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { HomeHeader } from "@/components/people/home-header";
import { toPersonGlobePoints } from "@/components/people/person-globe-model";
import { ProductSwitcher } from "@/components/product-switcher/product-switcher";
import type { PeopleDashboardDto } from "@/features/people/types";

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

export function PeopleGlobeWorkspace({
  dashboard,
  initialPersonId,
}: PeopleGlobeWorkspaceProps) {
  const router = useRouter();
  const [activeOperatorId, setActiveOperatorId] = useState(
    dashboard.operators[0]?.id ?? "",
  );
  const [selectedPersonId, setSelectedPersonId] = useState(initialPersonId);
  const points = useMemo(
    () => toPersonGlobePoints(dashboard.people),
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

      <main className={styles.globeWorkspace} id="people-globe-main">
        <aside
          aria-label="People with current approved locations"
          className={styles.globeRoster}
        >
          <header>
            <span className={styles.eyebrow}>Current approved locations</span>
            <h1>People globe</h1>
            <p>A shared presence layer for every operational signal module.</p>
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
                  <span className={styles.mapMarker} data-tier={person.tier} />
                  <span>
                    <strong>{person.displayName}</strong>
                    <small>{point.locationLabel}</small>
                  </span>
                  <em>{person.tier}</em>
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
          <footer>Operator-maintained locations · not live tracking</footer>
        </aside>

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
            <strong>{mappedPeople.length} located people</strong>
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
              <span className={styles.eyebrow}>Selected person</span>
              <h2>{selectedEntry.person.displayName}</h2>
              <p>
                {selectedEntry.person.organization ?? "Independent"} ·{" "}
                {selectedEntry.point.locationLabel}
              </p>
              <dl>
                <div>
                  <dt>Tier</dt>
                  <dd>{selectedEntry.person.tier}</dd>
                </div>
                <div>
                  <dt>Precision</dt>
                  <dd>{selectedEntry.point.locationPrecision}</dd>
                </div>
              </dl>
              <Link href={`/home?person=${selectedEntry.person.id}`}>
                Open person dossier →
              </Link>
            </article>
          ) : null}

          <footer className={styles.globeStageFooter}>
            <span>Current approved location view</span>
            <span>Synthetic demonstration data only</span>
          </footer>
        </section>
      </main>
    </div>
  );
}
