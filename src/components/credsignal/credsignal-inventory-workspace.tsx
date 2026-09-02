"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { CredSignalActivity } from "@/components/credsignal/credsignal-activity";
import { CredSignalCommandBar } from "@/components/credsignal/credsignal-command-bar";
import { CredSignalCredentialCreate } from "@/components/credsignal/credsignal-credential-create";
import { CredSignalCredentialDossier } from "@/components/credsignal/credsignal-credential-dossier";
import {
  CredSignalDossier,
  type CredSignalDossierTab,
} from "@/components/credsignal/credsignal-dossier";
import { CredSignalIntake } from "@/components/credsignal/credsignal-intake";
import { CredSignalTriage } from "@/components/credsignal/credsignal-triage";
import { credentialPostureForProtectee } from "@/components/credsignal/credsignal-globe-model";
import { ResizeHandle } from "@/components/layout/resize-handle";
import { LocalTimestamp } from "@/components/local-timestamp";
import { ProductSwitcher } from "@/components/product-switcher/product-switcher";
import type {
  CredSignalDashboardDto,
  CredSignalProtecteeDto,
} from "@/features/credsignal/types";
import { useElementSize } from "@/hooks/use-element-size";

import styles from "@/app/credsignal/credsignal.module.css";

type InventoryView = "people" | "cases" | "unmatched";
type StatusFilter = "all" | CredSignalProtecteeDto["status"];
type PostureFilter = "all" | ReturnType<typeof credentialPostureForProtectee>;

const DEFAULT_ACTIVITY_HEIGHT = 116;
const MIN_ACTIVITY_HEIGHT = 88;
const MIN_INVENTORY_HEIGHT = 360;
const COMMAND_BAR_HEIGHT = 64;
const RESIZE_HANDLE_SIZE = 8;

function normalizeSearchText(value: string) {
  return value
    .toLocaleLowerCase("en-US")
    .replaceAll(/[_-]+/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function titleCase(value: string) {
  return value
    .split("_")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function protecteeMatchesQuery(
  protectee: CredSignalProtecteeDto,
  query: string,
) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return true;
  }
  return normalizeSearchText(
    [
      protectee.displayName,
      protectee.title,
      protectee.organization,
      protectee.location?.label,
      protectee.status,
      credentialPostureForProtectee(protectee),
      ...protectee.identities.map((identity) => identity.displayValue),
      ...protectee.credentials.flatMap((credential) => [
        credential.accountIdentifier,
        credential.service,
        credential.serviceDomain,
        credential.credentialKind,
        credential.status,
      ]),
      ...protectee.exposures.flatMap((exposure) => [
        exposure.exposedIdentity,
        exposure.sourceName,
        exposure.service,
        exposure.serviceDomain,
      ]),
      ...protectee.cases.flatMap((responseCase) => [
        responseCase.title,
        responseCase.assigneeName,
        responseCase.status,
      ]),
    ]
      .filter(Boolean)
      .join(" "),
  ).includes(normalizedQuery);
}

function activeExposureCount(protectee: CredSignalProtecteeDto) {
  return protectee.exposures.filter(
    (exposure) =>
      exposure.status !== "remediated" && exposure.status !== "dismissed",
  ).length;
}

function managedCredentialCount(protectee: CredSignalProtecteeDto) {
  return protectee.credentials.filter(
    (credential) => credential.status !== "retired",
  ).length;
}

export function CredSignalInventoryWorkspace({
  dashboard,
}: {
  dashboard: CredSignalDashboardDto;
}) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const [shellRef, shellSize] = useElementSize<HTMLDivElement>();
  const [requestedActivityHeight, setRequestedActivityHeight] = useState(
    DEFAULT_ACTIVITY_HEIGHT,
  );
  const [view, setView] = useState<InventoryView>("people");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [postureFilter, setPostureFilter] = useState<PostureFilter>("all");
  const [selectedCredentialId, setSelectedCredentialId] = useState<string>();
  const [selectedProtecteeId, setSelectedProtecteeId] = useState<string>();
  const [selectedExposureId, setSelectedExposureId] = useState<string>();
  const [dossierTab, setDossierTab] = useState<CredSignalDossierTab>("cases");
  const [createOpen, setCreateOpen] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [activeOperatorId, setActiveOperatorId] = useState(
    dashboard.operators[0]?.id ?? "",
  );

  const activeProtectees = useMemo(
    () =>
      dashboard.protectees.filter((protectee) => protectee.status === "active"),
    [dashboard.protectees],
  );
  const selectedCredential = useMemo(
    () =>
      dashboard.credentials.find(
        (credential) => credential.id === selectedCredentialId,
      ),
    [dashboard.credentials, selectedCredentialId],
  );
  const selectedProtectee = useMemo(
    () =>
      dashboard.protectees.find(
        (protectee) =>
          protectee.id ===
          (selectedProtecteeId ?? selectedCredential?.protecteeId),
      ),
    [dashboard.protectees, selectedCredential, selectedProtecteeId],
  );
  const selectedUnmatchedExposure = useMemo(
    () =>
      dashboard.unmatchedExposures.find(
        (exposure) => exposure.id === selectedExposureId,
      ),
    [dashboard.unmatchedExposures, selectedExposureId],
  );
  const filteredProtectees = useMemo(
    () =>
      dashboard.protectees.filter(
        (protectee) =>
          protecteeMatchesQuery(protectee, query) &&
          (statusFilter === "all" || protectee.status === statusFilter) &&
          (postureFilter === "all" ||
            credentialPostureForProtectee(protectee) === postureFilter),
      ),
    [dashboard.protectees, postureFilter, query, statusFilter],
  );
  const caseRows = useMemo(
    () =>
      dashboard.protectees.flatMap((protectee) =>
        protectee.cases
          .filter(
            (responseCase) =>
              responseCase.status !== "closed" &&
              responseCase.status !== "dismissed",
          )
          .map((responseCase) => ({ protectee, responseCase })),
      ),
    [dashboard.protectees],
  );
  const filteredCases = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) {
      return caseRows;
    }
    return caseRows.filter(({ protectee, responseCase }) =>
      normalizeSearchText(
        [
          protectee.displayName,
          protectee.organization,
          responseCase.title,
          responseCase.priority,
          responseCase.status,
          responseCase.assigneeName,
        ]
          .filter(Boolean)
          .join(" "),
      ).includes(normalizedQuery),
    );
  }, [caseRows, query]);
  const filteredUnmatched = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) {
      return dashboard.unmatchedExposures;
    }
    return dashboard.unmatchedExposures.filter((exposure) =>
      normalizeSearchText(
        [
          exposure.exposedIdentity,
          exposure.sourceName,
          exposure.service,
          exposure.serviceDomain,
          exposure.credentialKind,
        ]
          .filter(Boolean)
          .join(" "),
      ).includes(normalizedQuery),
    );
  }, [dashboard.unmatchedExposures, query]);

  const closePanels = useCallback(() => {
    setCreateOpen(false);
    setIntakeOpen(false);
    setSelectedCredentialId(undefined);
    setSelectedProtecteeId(undefined);
    setSelectedExposureId(undefined);
  }, []);

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const editable =
        target?.matches("input, textarea, select, [contenteditable='true']") ??
        false;
      if (event.key === "/" && !editable) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape" && !editable) {
        closePanels();
      }
    }
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [closePanels]);

  function selectCredential(credentialId: string) {
    const credential = dashboard.credentials.find(
      (candidate) => candidate.id === credentialId,
    );
    setCreateOpen(false);
    setIntakeOpen(false);
    setSelectedExposureId(undefined);
    setSelectedProtecteeId(credential?.protecteeId);
    setSelectedCredentialId(credentialId);
  }

  function selectProtectee(protecteeId: string) {
    setCreateOpen(false);
    setIntakeOpen(false);
    setSelectedExposureId(undefined);
    setSelectedCredentialId(undefined);
    setDossierTab("overview");
    setSelectedProtecteeId(protecteeId);
  }

  function selectCase(protecteeId: string) {
    setCreateOpen(false);
    setIntakeOpen(false);
    setSelectedCredentialId(undefined);
    setSelectedExposureId(undefined);
    setSelectedProtecteeId(protecteeId);
    setDossierTab("cases");
    setView("people");
  }

  function selectUnmatched(exposureId: string) {
    setCreateOpen(false);
    setIntakeOpen(false);
    setSelectedCredentialId(undefined);
    setSelectedProtecteeId(undefined);
    setSelectedExposureId(exposureId);
  }

  function openCredentialCreate() {
    closePanels();
    setCreateOpen(true);
  }

  function openExposureIntake() {
    closePanels();
    setIntakeOpen(true);
  }

  const handleCredentialSaved = useCallback(
    (credentialId?: string) => {
      setCreateOpen(false);
      setSelectedCredentialId(credentialId);
      router.refresh();
    },
    [router],
  );
  const handleExposureSaved = useCallback(() => {
    setIntakeOpen(false);
    router.refresh();
  }, [router]);
  const handleMatched = useCallback(
    (protecteeId: string) => {
      setSelectedExposureId(undefined);
      setSelectedProtecteeId(protecteeId);
      setDossierTab("cases");
      setView("people");
      router.refresh();
    },
    [router],
  );

  const maximumActivityHeight = Math.max(
    MIN_ACTIVITY_HEIGHT,
    (shellSize.height || 800) -
      COMMAND_BAR_HEIGHT -
      MIN_INVENTORY_HEIGHT -
      RESIZE_HANDLE_SIZE,
  );
  const activityHeight = Math.min(
    requestedActivityHeight,
    maximumActivityHeight,
  );
  const shellStyle = {
    "--activity-strip-height": `${activityHeight}px`,
  } as CSSProperties;

  if (dashboard.setupRequired) {
    return (
      <main className={styles.setupShell}>
        <header className={styles.setupHeader}>
          <ProductSwitcher currentProduct="credsignal" />
        </header>
        <section className={styles.setupState}>
          <span className={styles.setupMark} aria-hidden="true">
            C
          </span>
          <span className={styles.eyebrow}>Local workspace required</span>
          <h1>Initialize CredSignal</h1>
          <p>
            PostgreSQL is connected, but the local workspace has not been
            seeded. Apply migrations and create the synthetic starter workspace.
          </p>
          <pre>
            <code>npm run db:migrate{"\n"}npm run db:seed</code>
          </pre>
        </section>
      </main>
    );
  }

  return (
    <div className={styles.shell} ref={shellRef} style={shellStyle}>
      <a className="skip-link" href="#people-credential-operations">
        Skip to people credential operations
      </a>
      <CredSignalCommandBar
        activeOperatorId={activeOperatorId}
        metrics={dashboard.metrics}
        onAddCredential={openCredentialCreate}
        onOperatorChange={setActiveOperatorId}
        operators={dashboard.operators}
        view="inventory"
      />

      <div
        className={styles.inventoryWorkspace}
        id="people-credential-operations"
      >
        <main className={styles.inventoryStage}>
          <header className={styles.inventoryHeader}>
            <div>
              <span className={styles.eyebrow}>Credential operations</span>
              <h1>People credential operations</h1>
              <p>
                One operational record per person, with credentials, evidence,
                and response work in context.
              </p>
            </div>
            <nav aria-label="CredSignal views" className={styles.viewSwitcher}>
              <Link aria-current="page" href="/credsignal">
                Table
              </Link>
              <Link href="/credsignal/globe">Globe</Link>
              <Link href="/home">People</Link>
            </nav>
          </header>

          <div className={styles.inventoryControls}>
            <label className={styles.inventorySearch}>
              <span aria-hidden="true">⌕</span>
              <span className="sr-only">
                Search the active CredSignal table
              </span>
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder={
                  view === "people"
                    ? "Person, identity, credential, case…"
                    : view === "cases"
                      ? "Person, case, assignee…"
                      : "Identity, source, service…"
                }
                ref={searchRef}
                type="search"
                value={query}
              />
              <kbd>/</kbd>
            </label>

            {view === "people" ? (
              <div className={styles.inventoryFilters}>
                <label>
                  <span className="sr-only">Person status</span>
                  <select
                    onChange={(event) =>
                      setStatusFilter(event.target.value as StatusFilter)
                    }
                    value={statusFilter}
                  >
                    <option value="all">All people</option>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
                <label>
                  <span className="sr-only">Exposure posture</span>
                  <select
                    onChange={(event) =>
                      setPostureFilter(event.target.value as PostureFilter)
                    }
                    value={postureFilter}
                  >
                    <option value="all">All postures</option>
                    <option value="no_known_exposure">No known exposure</option>
                    <option value="potential_exposure">
                      Potential exposure
                    </option>
                    <option value="confirmed_exposure">
                      Confirmed exposure
                    </option>
                    <option value="in_response">In response</option>
                    <option value="remediated">Remediated</option>
                  </select>
                </label>
              </div>
            ) : (
              <div className={styles.inventoryFilters} />
            )}

            <button
              className={styles.recordExposureAction}
              onClick={openExposureIntake}
              type="button"
            >
              ＋ Record exposure
            </button>
          </div>

          <div
            className={styles.inventoryTabs}
            role="tablist"
            aria-label="Credential operations table"
          >
            <button
              aria-selected={view === "people"}
              onClick={() => setView("people")}
              role="tab"
              type="button"
            >
              People <span>{dashboard.protectees.length}</span>
            </button>
            <button
              aria-selected={view === "cases"}
              onClick={() => setView("cases")}
              role="tab"
              type="button"
            >
              Open cases <span>{caseRows.length}</span>
            </button>
            <button
              aria-selected={view === "unmatched"}
              onClick={() => setView("unmatched")}
              role="tab"
              type="button"
            >
              Unmatched <span>{dashboard.unmatchedExposures.length}</span>
            </button>
          </div>

          <div className={styles.tableViewport} role="tabpanel">
            {view === "people" ? (
              filteredProtectees.length > 0 ? (
                <table
                  className={`${styles.dataTable} ${styles.peopleDataTable}`}
                >
                  <caption className="sr-only">
                    People credential operations
                  </caption>
                  <thead>
                    <tr>
                      <th>Person / primary identity</th>
                      <th>Organization / location</th>
                      <th>Managed credentials</th>
                      <th>Active exposures</th>
                      <th>Credential posture</th>
                      <th>Open cases</th>
                      <th>Open tasks</th>
                      <th aria-label="Open person dossier" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProtectees.map((protectee) => {
                      const primaryIdentity =
                        protectee.identities.find(
                          (identity) => identity.isPrimary && identity.isActive,
                        ) ??
                        protectee.identities.find(
                          (identity) => identity.isActive,
                        );
                      const selected = protectee.id === selectedProtectee?.id;
                      const posture = credentialPostureForProtectee(protectee);

                      return (
                        <tr data-selected={selected} key={protectee.id}>
                          <td>
                            <button
                              aria-pressed={selected}
                              className={styles.tablePrimaryLink}
                              onClick={() => selectProtectee(protectee.id)}
                              type="button"
                            >
                              <strong>{protectee.displayName}</strong>
                              <small>
                                {primaryIdentity?.displayValue ??
                                  "No active identity"}
                              </small>
                            </button>
                          </td>
                          <td>
                            <strong>
                              {protectee.organization ?? "Independent"}
                            </strong>
                            <small>
                              {protectee.location?.label ?? "No location"}
                            </small>
                          </td>
                          <td className={styles.numericCell}>
                            {managedCredentialCount(protectee)}
                          </td>
                          <td className={styles.numericCell}>
                            {activeExposureCount(protectee)}
                          </td>
                          <td>
                            <span
                              className={styles.postureBadge}
                              data-posture={posture}
                            >
                              {titleCase(posture)}
                            </span>
                          </td>
                          <td className={styles.numericCell}>
                            {protectee.openCaseCount}
                          </td>
                          <td className={styles.numericCell}>
                            {protectee.openTaskCount}
                          </td>
                          <td>
                            <button
                              aria-label={`Open credential operations for ${protectee.displayName}`}
                              className={styles.rowAction}
                              onClick={() => selectProtectee(protectee.id)}
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
              ) : (
                <div className={styles.tableEmpty}>
                  <strong>No people match this view</strong>
                  <p>Clear the search or person-level filters.</p>
                </div>
              )
            ) : null}

            {view === "cases" ? (
              filteredCases.length > 0 ? (
                <table className={styles.dataTable}>
                  <caption className="sr-only">
                    Open CredSignal response cases
                  </caption>
                  <thead>
                    <tr>
                      <th>Person</th>
                      <th>Case</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Assignee</th>
                      <th>Due</th>
                      <th>Open tasks</th>
                      <th aria-label="Open case" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCases.map(({ protectee, responseCase }) => (
                      <tr key={responseCase.id}>
                        <td>
                          <strong>{protectee.displayName}</strong>
                          <small>
                            {protectee.organization ?? "Independent"}
                          </small>
                        </td>
                        <td>{responseCase.title}</td>
                        <td>
                          <span
                            className={styles.priorityBadge}
                            data-priority={responseCase.priority}
                          >
                            {titleCase(responseCase.priority)}
                          </span>
                        </td>
                        <td>{titleCase(responseCase.status)}</td>
                        <td>{responseCase.assigneeName ?? "Unassigned"}</td>
                        <td>
                          {responseCase.dueAt ? (
                            <LocalTimestamp timestamp={responseCase.dueAt} />
                          ) : (
                            "No due date"
                          )}
                        </td>
                        <td className={styles.numericCell}>
                          {
                            responseCase.tasks.filter(
                              (task) =>
                                task.status !== "completed" &&
                                task.status !== "cancelled",
                            ).length
                          }
                        </td>
                        <td>
                          <button
                            aria-label={`Open case for ${protectee.displayName}`}
                            className={styles.rowAction}
                            onClick={() => selectCase(protectee.id)}
                            type="button"
                          >
                            →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className={styles.tableEmpty}>
                  <strong>No open cases match</strong>
                  <p>Matched exposure response cases appear here.</p>
                </div>
              )
            ) : null}

            {view === "unmatched" ? (
              filteredUnmatched.length > 0 ? (
                <table className={styles.dataTable}>
                  <caption className="sr-only">
                    Unmatched credential exposures
                  </caption>
                  <thead>
                    <tr>
                      <th>Exposed identity</th>
                      <th>Service</th>
                      <th>Credential type</th>
                      <th>Source</th>
                      <th>Severity</th>
                      <th>Observed</th>
                      <th>Status</th>
                      <th aria-label="Resolve exposure" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUnmatched.map((exposure) => (
                      <tr key={exposure.id}>
                        <td>
                          <strong>{exposure.exposedIdentity}</strong>
                          <small>{titleCase(exposure.identityType)}</small>
                        </td>
                        <td>
                          {exposure.service ??
                            exposure.serviceDomain ??
                            "Unknown"}
                        </td>
                        <td>{titleCase(exposure.credentialKind)}</td>
                        <td>{exposure.sourceName}</td>
                        <td>
                          <span
                            className={styles.priorityBadge}
                            data-priority={exposure.severity}
                          >
                            {titleCase(exposure.severity)}
                          </span>
                        </td>
                        <td>
                          <LocalTimestamp timestamp={exposure.observedAt} />
                        </td>
                        <td>{titleCase(exposure.status)}</td>
                        <td>
                          <button
                            aria-label={`Resolve exposure for ${exposure.exposedIdentity}`}
                            className={styles.rowAction}
                            onClick={() => selectUnmatched(exposure.id)}
                            type="button"
                          >
                            →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className={styles.tableEmpty}>
                  <strong>Identity queue clear</strong>
                  <p>Every recorded exposure has a confirmed person match.</p>
                </div>
              )
            ) : null}
          </div>

          <footer className={styles.inventoryFooter}>
            <span>
              {view === "people"
                ? `${filteredProtectees.length} of ${dashboard.protectees.length} people`
                : view === "cases"
                  ? `${filteredCases.length} open cases`
                  : `${filteredUnmatched.length} unmatched exposures`}
            </span>
            <span>Synthetic demo workspace · values encrypted at rest</span>
          </footer>
        </main>

        {createOpen ? (
          <CredSignalCredentialCreate
            activeOperatorId={activeOperatorId}
            key="create-credential"
            onClose={() => setCreateOpen(false)}
            onSaved={handleCredentialSaved}
            protectees={activeProtectees}
          />
        ) : intakeOpen ? (
          <CredSignalIntake
            activeOperatorId={activeOperatorId}
            onClose={() => setIntakeOpen(false)}
            onSaved={handleExposureSaved}
            operators={dashboard.operators}
            protectees={activeProtectees}
          />
        ) : selectedUnmatchedExposure ? (
          <CredSignalTriage
            activeOperatorId={activeOperatorId}
            exposure={selectedUnmatchedExposure}
            key={selectedUnmatchedExposure.id}
            onClose={() => setSelectedExposureId(undefined)}
            onCreateProtectee={() => router.push("/home?create=1")}
            onMatched={handleMatched}
            protectees={activeProtectees}
          />
        ) : selectedCredential ? (
          <CredSignalCredentialDossier
            activeOperatorId={activeOperatorId}
            credential={selectedCredential}
            key={selectedCredential.id}
            onBackToPerson={() => setSelectedCredentialId(undefined)}
            onClose={() => {
              setSelectedCredentialId(undefined);
              setSelectedProtecteeId(undefined);
            }}
            onManagePerson={() =>
              router.push(`/home?person=${selectedCredential.protecteeId}`)
            }
            onRefresh={() => router.refresh()}
            protectee={selectedProtectee}
          />
        ) : selectedProtectee ? (
          <CredSignalDossier
            activeOperatorId={activeOperatorId}
            key={selectedProtectee.id}
            onClose={() => setSelectedProtecteeId(undefined)}
            onManage={() => router.push(`/home?person=${selectedProtectee.id}`)}
            onSelectCredential={selectCredential}
            onTabChange={setDossierTab}
            operators={dashboard.operators}
            protectee={selectedProtectee}
            tab={dossierTab}
          />
        ) : null}
      </div>

      <ResizeHandle
        direction={-1}
        label="Resize case activity"
        max={maximumActivityHeight}
        min={MIN_ACTIVITY_HEIGHT}
        onResize={setRequestedActivityHeight}
        orientation="horizontal"
        value={activityHeight}
      />
      <CredSignalActivity activity={dashboard.recentActivity} />
    </div>
  );
}
