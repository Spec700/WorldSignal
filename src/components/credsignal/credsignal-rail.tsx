import Link from "next/link";
import { useMemo, type RefObject } from "react";

import type {
  CredSignalCaseDto,
  CredSignalDashboardDto,
  CredSignalProtecteeDto,
} from "@/features/credsignal/types";

import styles from "@/app/credsignal/credsignal.module.css";

export type CredSignalQueueView = "protectees" | "cases" | "unmatched";

interface CredSignalRailProps {
  dashboard: CredSignalDashboardDto;
  view: CredSignalQueueView;
  query: string;
  selectedProtecteeId?: string;
  selectedExposureId?: string;
  searchRef: RefObject<HTMLInputElement | null>;
  onViewChange: (view: CredSignalQueueView) => void;
  onQueryChange: (query: string) => void;
  onSelectProtectee: (
    protecteeId: string,
    tab?: "overview" | "cases" | "exposures",
  ) => void;
  onSelectUnmatchedExposure: (exposureId: string) => void;
}

function matchesQuery(protectee: CredSignalProtecteeDto, query: string) {
  if (!query) {
    return true;
  }
  const haystack = [
    protectee.displayName,
    protectee.title,
    protectee.organization,
    protectee.location?.label,
    ...protectee.identities.map((identity) => identity.displayValue),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("en-US");
  return haystack.includes(query.toLocaleLowerCase("en-US"));
}

function caseOwner(
  responseCase: CredSignalCaseDto,
  protectees: CredSignalProtecteeDto[],
) {
  return protectees.find((protectee) =>
    protectee.cases.some((candidate) => candidate.id === responseCase.id),
  );
}

export function CredSignalRail({
  dashboard,
  view,
  query,
  selectedProtecteeId,
  selectedExposureId,
  searchRef,
  onViewChange,
  onQueryChange,
  onSelectProtectee,
  onSelectUnmatchedExposure,
}: CredSignalRailProps) {
  const protectees = useMemo(
    () =>
      dashboard.protectees.filter((protectee) =>
        matchesQuery(protectee, query),
      ),
    [dashboard.protectees, query],
  );
  const cases = useMemo(
    () =>
      dashboard.protectees
        .flatMap((protectee) => protectee.cases)
        .filter(
          (responseCase) =>
            responseCase.status !== "closed" &&
            responseCase.status !== "dismissed",
        )
        .filter((responseCase) => {
          if (!query) {
            return true;
          }
          const owner = caseOwner(responseCase, dashboard.protectees);
          return `${responseCase.title} ${owner?.displayName ?? ""} ${responseCase.assigneeName ?? ""}`
            .toLocaleLowerCase("en-US")
            .includes(query.toLocaleLowerCase("en-US"));
        }),
    [dashboard.protectees, query],
  );

  return (
    <aside className={styles.rail} aria-label="CredSignal work queue">
      <div className={styles.railHeading}>
        <span className={styles.eyebrow}>Credential operations</span>
        <Link className={styles.secondaryAction} href="/home">
          Manage people
        </Link>
      </div>

      <label className={styles.searchControl}>
        <span className="sr-only">Search protectees and cases</span>
        <span aria-hidden="true">⌕</span>
        <input
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Protectee, identity, case…"
          ref={searchRef}
          type="search"
          value={query}
        />
        <kbd>/</kbd>
      </label>

      <div
        className={styles.queueTabs}
        role="tablist"
        aria-label="Work queue view"
      >
        <button
          aria-selected={view === "protectees"}
          onClick={() => onViewChange("protectees")}
          role="tab"
          type="button"
        >
          Protectees <span>{dashboard.protectees.length}</span>
        </button>
        <button
          aria-selected={view === "cases"}
          onClick={() => onViewChange("cases")}
          role="tab"
          type="button"
        >
          Cases <span>{dashboard.metrics.openCases}</span>
        </button>
        <button
          aria-selected={view === "unmatched"}
          onClick={() => onViewChange("unmatched")}
          role="tab"
          type="button"
        >
          Unmatched <span>{dashboard.unmatchedExposures.length}</span>
        </button>
      </div>

      <div className={styles.queueList} role="tabpanel">
        {view === "protectees" ? (
          protectees.length > 0 ? (
            protectees.map((protectee) => (
              <button
                aria-pressed={protectee.id === selectedProtecteeId}
                className={styles.queueItem}
                data-priority={protectee.activePriority ?? "low"}
                key={protectee.id}
                onClick={() => onSelectProtectee(protectee.id)}
                type="button"
              >
                <span className={styles.queuePriority} aria-hidden="true" />
                <span className={styles.queueCopy}>
                  <strong>{protectee.displayName}</strong>
                  <small>
                    {protectee.organization ?? "Independent"} ·{" "}
                    {protectee.location?.label ?? "No location"}
                  </small>
                  <span>
                    {protectee.openCaseCount} open cases ·{" "}
                    {protectee.openTaskCount} tasks
                  </span>
                </span>
                <span className={styles.priorityText}>
                  {protectee.status === "active"
                    ? (protectee.activePriority ?? "clear")
                    : protectee.status}
                </span>
              </button>
            ))
          ) : (
            <div className={styles.queueEmpty}>
              <strong>No protectees match</strong>
              <span>Clear the search or add a monitored person.</span>
            </div>
          )
        ) : null}

        {view === "cases" ? (
          cases.length > 0 ? (
            cases.map((responseCase) => {
              const owner = caseOwner(responseCase, dashboard.protectees);
              return (
                <button
                  className={styles.queueItem}
                  data-priority={responseCase.priority}
                  key={responseCase.id}
                  onClick={() => owner && onSelectProtectee(owner.id, "cases")}
                  type="button"
                >
                  <span className={styles.queuePriority} aria-hidden="true" />
                  <span className={styles.queueCopy}>
                    <strong>{responseCase.title}</strong>
                    <small>
                      {owner?.displayName ?? "Unassigned protectee"}
                    </small>
                    <span>
                      {responseCase.status} ·{" "}
                      {responseCase.assigneeName ?? "Unassigned"}
                    </span>
                  </span>
                  <span className={styles.priorityText}>
                    {responseCase.priority}
                  </span>
                </button>
              );
            })
          ) : (
            <div className={styles.queueEmpty}>
              <strong>No active cases</strong>
              <span>New matched exposures will appear here.</span>
            </div>
          )
        ) : null}

        {view === "unmatched" ? (
          dashboard.unmatchedExposures.length > 0 ? (
            dashboard.unmatchedExposures.map((exposure) => (
              <button
                aria-pressed={exposure.id === selectedExposureId}
                className={styles.unmatchedItem}
                key={exposure.id}
                onClick={() => onSelectUnmatchedExposure(exposure.id)}
                type="button"
              >
                <span className={styles.priorityText}>{exposure.severity}</span>
                <strong>{exposure.exposedIdentity}</strong>
                <small>{exposure.sourceName}</small>
                <span>{exposure.credentialKind.replaceAll("_", " ")}</span>
              </button>
            ))
          ) : (
            <div className={styles.queueEmpty}>
              <strong>Identity queue clear</strong>
              <span>Every recorded exposure has a protectee match.</span>
            </div>
          )
        ) : null}
      </div>
    </aside>
  );
}
