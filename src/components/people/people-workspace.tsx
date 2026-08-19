"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { LocalTimestamp } from "@/components/local-timestamp";
import { HomeHeader } from "@/components/people/home-header";
import { PersonEditor } from "@/components/people/person-editor";
import { ProductSwitcher } from "@/components/product-switcher/product-switcher";
import type {
  PeopleDashboardDto,
  PersonDto,
  PersonStatus,
  PersonTier,
} from "@/features/people/types";

import styles from "@/app/home/home.module.css";

type StatusFilter = "all" | PersonStatus;
type TierFilter = "all" | PersonTier;

interface PeopleWorkspaceProps {
  dashboard: PeopleDashboardDto;
  initialPersonId?: string;
  startCreating?: boolean;
}

function titleCase(value: string) {
  return value
    .split("_")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function primaryIdentity(person: PersonDto) {
  return (
    person.identities.find(
      (identity) => identity.isActive && identity.isPrimary,
    ) ?? person.identities.find((identity) => identity.isActive)
  );
}

function matchesPerson(person: PersonDto, query: string) {
  if (!query.trim()) {
    return true;
  }

  const haystack = [
    person.displayName,
    person.title,
    person.organization,
    person.location?.label,
    ...person.identities.map((identity) => identity.displayValue),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("en-US");

  return haystack.includes(query.trim().toLocaleLowerCase("en-US"));
}

function PersonDossier({
  person,
  onClose,
  onManage,
}: {
  person: PersonDto;
  onClose: () => void;
  onManage: () => void;
}) {
  const activeIdentities = person.identities.filter(
    (identity) => identity.isActive,
  );

  return (
    <aside
      aria-label={`${person.displayName} person dossier`}
      className={styles.dossier}
    >
      <header className={styles.dossierHeader} data-tier={person.tier}>
        <span className={styles.eyebrow}>Person dossier</span>
        <button
          className={styles.manageAction}
          onClick={onManage}
          type="button"
        >
          Manage
        </button>
        <button
          aria-label="Close person dossier"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
        <h2>{person.displayName}</h2>
        <p>
          {person.title ?? "Priority person"}
          {person.organization ? ` · ${person.organization}` : ""}
        </p>
        <dl className={styles.dossierSummary}>
          <div>
            <dt>Tier</dt>
            <dd>{person.tier}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{person.status}</dd>
          </div>
          <div>
            <dt>Locations</dt>
            <dd>{person.locationHistory.length}</dd>
          </div>
        </dl>
      </header>

      <div className={styles.dossierBody}>
        <section className={styles.dossierSection}>
          <h3>Current approved location</h3>
          {person.location ? (
            <dl className={styles.factList}>
              <div>
                <dt>Location</dt>
                <dd>{person.location.label}</dd>
              </div>
              <div>
                <dt>Precision</dt>
                <dd>{titleCase(person.location.precision)}</dd>
              </div>
              <div>
                <dt>Coordinates</dt>
                <dd>
                  {person.location.latitude.toFixed(4)},{" "}
                  {person.location.longitude.toFixed(4)}
                </dd>
              </div>
              <div>
                <dt>Effective</dt>
                <dd>
                  <LocalTimestamp timestamp={person.location.effectiveFrom} />
                </dd>
              </div>
            </dl>
          ) : (
            <p className={styles.emptyCopy}>No current location is approved.</p>
          )}
        </section>

        <section className={styles.dossierSection}>
          <h3>Approved identities</h3>
          {activeIdentities.length > 0 ? (
            <ul className={styles.identityList}>
              {activeIdentities.map((identity) => (
                <li key={identity.id}>
                  <span>{titleCase(identity.type)}</span>
                  <strong>{identity.displayValue}</strong>
                  <small>{identity.isPrimary ? "Primary" : "Active"}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.emptyCopy}>No active identities.</p>
          )}
        </section>

        <section className={styles.dossierSection}>
          <h3>Protection context</h3>
          <p className={styles.notesCopy}>
            {person.notes ||
              "No operator context has been recorded for this person."}
          </p>
        </section>

        <section className={styles.dossierSection}>
          <h3>Location history</h3>
          <ol className={styles.locationHistory}>
            {person.locationHistory.map((location) => (
              <li key={location.id}>
                <span aria-hidden="true" />
                <div>
                  <strong>{location.label}</strong>
                  <small>
                    <LocalTimestamp timestamp={location.effectiveFrom} />
                    {location.effectiveTo ? (
                      <>
                        {" — "}
                        <LocalTimestamp timestamp={location.effectiveTo} />
                      </>
                    ) : (
                      " — Current"
                    )}
                  </small>
                </div>
                <em>{location.precision}</em>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </aside>
  );
}

export function PeopleWorkspace({
  dashboard,
  initialPersonId,
  startCreating = false,
}: PeopleWorkspaceProps) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [tier, setTier] = useState<TierFilter>("all");
  const [selectedPersonId, setSelectedPersonId] = useState(initialPersonId);
  const [editorMode, setEditorMode] = useState<"create" | "manage" | null>(
    startCreating ? "create" : null,
  );
  const [activeOperatorId, setActiveOperatorId] = useState(
    dashboard.operators[0]?.id ?? "",
  );

  const selectedPerson = dashboard.people.find(
    (person) => person.id === selectedPersonId,
  );
  const filteredPeople = useMemo(
    () =>
      dashboard.people.filter(
        (person) =>
          matchesPerson(person, query) &&
          (status === "all" || person.status === status) &&
          (tier === "all" || person.tier === tier),
      ),
    [dashboard.people, query, status, tier],
  );

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const editable = target?.matches(
        "input, textarea, select, [contenteditable='true']",
      );

      if (event.key === "/" && !editable) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape" && !editable) {
        if (editorMode) {
          setEditorMode(null);
        } else {
          setSelectedPersonId(undefined);
        }
      }
    }

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [editorMode]);

  function selectPerson(personId: string) {
    setEditorMode(null);
    setSelectedPersonId(personId);
  }

  function handleSaved(personId?: string) {
    setEditorMode(null);
    if (personId) {
      setSelectedPersonId(personId);
    }
    router.refresh();
  }

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
      <a className="skip-link" href="#people-main">
        Skip to people roster
      </a>
      <HomeHeader
        activeOperatorId={activeOperatorId}
        currentView="people"
        metrics={dashboard.metrics}
        onAddPerson={() => {
          setSelectedPersonId(undefined);
          setEditorMode("create");
        }}
        onOperatorChange={setActiveOperatorId}
        operators={dashboard.operators}
      />

      <div className={styles.workspace} id="people-main">
        <main className={styles.roster}>
          <section className={styles.rosterIntro}>
            <div>
              <span className={styles.eyebrow}>People first</span>
              <h1>People</h1>
              <p>
                The individuals Priority Signals is responsible for protecting,
                independent of any single threat or exposure.
              </p>
            </div>
            <span className={styles.coverageStatement}>
              <strong>{dashboard.metrics.located}</strong>
              <small>active people mapped</small>
            </span>
          </section>

          <section className={styles.tableControls} aria-label="Roster filters">
            <label className={styles.searchControl}>
              <span aria-hidden="true">⌕</span>
              <span className="sr-only">Search people</span>
              <input
                aria-label="Search people"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, organization, identity, location…"
                ref={searchRef}
                type="search"
                value={query}
              />
              <kbd>/</kbd>
            </label>
            <label className={styles.compactControl}>
              <span>Status</span>
              <select
                onChange={(event) =>
                  setStatus(event.target.value as StatusFilter)
                }
                value={status}
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label className={styles.compactControl}>
              <span>Tier</span>
              <select
                onChange={(event) => setTier(event.target.value as TierFilter)}
                value={tier}
              >
                <option value="all">All tiers</option>
                <option value="critical">Critical</option>
                <option value="high">High attention</option>
                <option value="standard">Standard</option>
              </select>
            </label>
            <span className={styles.resultCount} aria-live="polite">
              {filteredPeople.length} of {dashboard.people.length}
            </span>
          </section>

          <div className={styles.tableViewport}>
            <table className={styles.peopleTable}>
              <caption className="sr-only">
                Priority people, locations, roster status, and approved
                identities
              </caption>
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Organization</th>
                  <th scope="col">Current location</th>
                  <th scope="col">Tier</th>
                  <th scope="col">Status</th>
                  <th scope="col">Primary identity</th>
                  <th scope="col">Updated</th>
                  <th scope="col">
                    <span className="sr-only">View dossier</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredPeople.map((person) => {
                  const identity = primaryIdentity(person);
                  return (
                    <tr
                      data-selected={person.id === selectedPersonId}
                      key={person.id}
                    >
                      <th scope="row">
                        <button
                          className={styles.personButton}
                          onClick={() => selectPerson(person.id)}
                          type="button"
                        >
                          <span data-tier={person.tier} aria-hidden="true">
                            {person.displayName
                              .split(/\s+/)
                              .slice(0, 2)
                              .map((part) => part[0])
                              .join("")}
                          </span>
                          <span>
                            <strong>{person.displayName}</strong>
                            <small>{person.title ?? "Priority person"}</small>
                          </span>
                        </button>
                      </th>
                      <td>{person.organization ?? "Independent"}</td>
                      <td>
                        <span className={styles.locationCell}>
                          <i data-located={Boolean(person.location)} />
                          <span>
                            <strong>
                              {person.location?.label ?? "Not located"}
                            </strong>
                            <small>
                              {person.location
                                ? titleCase(person.location.precision)
                                : "Location required"}
                            </small>
                          </span>
                        </span>
                      </td>
                      <td>
                        <span
                          className={styles.tierBadge}
                          data-tier={person.tier}
                        >
                          {person.tier === "high" ? "High" : person.tier}
                        </span>
                      </td>
                      <td>
                        <span
                          className={styles.statusBadge}
                          data-status={person.status}
                        >
                          {person.status}
                        </span>
                      </td>
                      <td>
                        <span className={styles.identityCell}>
                          <strong>
                            {identity ? titleCase(identity.type) : "None"}
                          </strong>
                          <small>{identity?.displayValue ?? "—"}</small>
                        </span>
                      </td>
                      <td className={styles.updatedCell}>
                        <LocalTimestamp timestamp={person.updatedAt} />
                      </td>
                      <td>
                        <button
                          aria-label={`View ${person.displayName}`}
                          className={styles.rowAction}
                          onClick={() => selectPerson(person.id)}
                          type="button"
                        >
                          →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredPeople.length === 0 ? (
              <div className={styles.emptyRoster}>
                <strong>No people match these filters.</strong>
                <p>Clear the search or broaden the roster status and tier.</p>
                <button
                  onClick={() => {
                    setQuery("");
                    setStatus("all");
                    setTier("all");
                  }}
                  type="button"
                >
                  Clear filters
                </button>
              </div>
            ) : null}
          </div>

          <footer className={styles.rosterFooter}>
            <span>Locations are operator-maintained, not live tracking.</span>
            <span>Synthetic demonstration data only.</span>
          </footer>
        </main>

        {editorMode ? (
          <PersonEditor
            activeOperatorId={activeOperatorId}
            mode={editorMode}
            onClose={() => setEditorMode(null)}
            onSaved={handleSaved}
            person={editorMode === "manage" ? selectedPerson : undefined}
          />
        ) : selectedPerson ? (
          <PersonDossier
            onClose={() => setSelectedPersonId(undefined)}
            onManage={() => setEditorMode("manage")}
            person={selectedPerson}
          />
        ) : null}
      </div>
    </div>
  );
}
