"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { LocalTimestamp } from "@/components/local-timestamp";
import { ProductSwitcher } from "@/components/product-switcher/product-switcher";
import type {
  CredSignalCredentialDto,
  CredSignalDashboardDto,
} from "@/features/credsignal/types";

import styles from "@/app/credsignal/credsignal.module.css";

type InventoryView = "credentials" | "cases" | "unmatched";
type StatusFilter = "all" | CredSignalCredentialDto["status"];
type PostureFilter = "all" | CredSignalCredentialDto["exposurePosture"];

function titleCase(value: string) {
  return value
    .split("_")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function credentialMatchesQuery(
  credential: CredSignalCredentialDto,
  query: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase("en-US");
  if (!normalizedQuery) {
    return true;
  }
  return [
    credential.protecteeName,
    credential.accountIdentifier,
    credential.service,
    credential.serviceDomain,
    credential.credentialKind,
    credential.status,
    credential.exposurePosture,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("en-US")
    .includes(normalizedQuery);
}

export function CredSignalInventoryWorkspace({
  dashboard,
}: {
  dashboard: CredSignalDashboardDto;
}) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<InventoryView>("credentials");
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
        (protectee) => protectee.id === selectedProtecteeId,
      ),
    [dashboard.protectees, selectedProtecteeId],
  );
  const selectedUnmatchedExposure = useMemo(
    () =>
      dashboard.unmatchedExposures.find(
        (exposure) => exposure.id === selectedExposureId,
      ),
    [dashboard.unmatchedExposures, selectedExposureId],
  );
  const filteredCredentials = useMemo(
    () =>
      dashboard.credentials.filter(
        (credential) =>
          credentialMatchesQuery(credential, query) &&
          (statusFilter === "all" || credential.status === statusFilter) &&
          (postureFilter === "all" ||
            credential.exposurePosture === postureFilter),
      ),
    [dashboard.credentials, postureFilter, query, statusFilter],
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
    const normalizedQuery = query.trim().toLocaleLowerCase("en-US");
    if (!normalizedQuery) {
      return caseRows;
    }
    return caseRows.filter(({ protectee, responseCase }) =>
      [
        protectee.displayName,
        protectee.organization,
        responseCase.title,
        responseCase.priority,
        responseCase.status,
        responseCase.assigneeName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("en-US")
        .includes(normalizedQuery),
    );
  }, [caseRows, query]);
  const filteredUnmatched = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("en-US");
    if (!normalizedQuery) {
      return dashboard.unmatchedExposures;
    }
    return dashboard.unmatchedExposures.filter((exposure) =>
      [
        exposure.exposedIdentity,
        exposure.sourceName,
        exposure.service,
        exposure.serviceDomain,
        exposure.credentialKind,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("en-US")
        .includes(normalizedQuery),
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
    setCreateOpen(false);
    setIntakeOpen(false);
    setSelectedProtecteeId(undefined);
    setSelectedExposureId(undefined);
    setSelectedCredentialId(credentialId);
  }

  function selectCase(protecteeId: string) {
    setCreateOpen(false);
    setIntakeOpen(false);
    setSelectedCredentialId(undefined);
    setSelectedExposureId(undefined);
    setSelectedProtecteeId(protecteeId);
    setDossierTab("cases");
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
      setView("cases");
      router.refresh();
    },
    [router],
  );

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
    <div className={styles.shell}>
      <a className="skip-link" href="#credential-inventory">
        Skip to credential inventory
      </a>
      <CredSignalCommandBar
        activeOperatorId={activeOperatorId}
        metrics={dashboard.metrics}
        onAddCredential={openCredentialCreate}
        onOperatorChange={setActiveOperatorId}
        operators={dashboard.operators}
        view="inventory"
      />

      <div className={styles.inventoryWorkspace} id="credential-inventory">
        <main className={styles.inventoryStage}>
          <header className={styles.inventoryHeader}>
            <div>
              <span className={styles.eyebrow}>Credential operations</span>
              <h1>Managed credential inventory</h1>
              <p>
                Active credentials, exposure evidence, and response ownership
                for Priority Signals people.
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
                  view === "credentials"
                    ? "Person, account, service, domain…"
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

            {view === "credentials" ? (
              <div className={styles.inventoryFilters}>
                <label>
                  <span className="sr-only">Credential status</span>
                  <select
                    onChange={(event) =>
                      setStatusFilter(event.target.value as StatusFilter)
                    }
                    value={statusFilter}
                  >
                    <option value="all">All statuses</option>
                    <option value="active">Active</option>
                    <option value="rotating">Rotating</option>
                    <option value="revoked">Revoked</option>
                    <option value="retired">Retired</option>
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
              aria-selected={view === "credentials"}
              onClick={() => setView("credentials")}
              role="tab"
              type="button"
            >
              Credentials <span>{dashboard.credentials.length}</span>
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
            {view === "credentials" ? (
              filteredCredentials.length > 0 ? (
                <table className={styles.dataTable}>
                  <caption className="sr-only">
                    Managed credential inventory
                  </caption>
                  <thead>
                    <tr>
                      <th>Person / account</th>
                      <th>Service</th>
                      <th>Type</th>
                      <th>Operational status</th>
                      <th>Exposure posture</th>
                      <th>Version / updated</th>
                      <th>Cases</th>
                      <th aria-label="Open record" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCredentials.map((credential) => (
                      <tr
                        data-selected={credential.id === selectedCredentialId}
                        key={credential.id}
                      >
                        <td>
                          <button
                            className={styles.tablePrimaryLink}
                            onClick={() => selectCredential(credential.id)}
                            type="button"
                          >
                            <strong>{credential.protecteeName}</strong>
                            <small>{credential.accountIdentifier}</small>
                          </button>
                        </td>
                        <td>
                          <strong>{credential.service}</strong>
                          <small>
                            {credential.serviceDomain ?? "No domain"}
                          </small>
                        </td>
                        <td>{titleCase(credential.credentialKind)}</td>
                        <td>
                          <span
                            className={styles.tableBadge}
                            data-status={credential.status}
                          >
                            {titleCase(credential.status)}
                          </span>
                        </td>
                        <td>
                          <span
                            className={styles.postureBadge}
                            data-posture={credential.exposurePosture}
                          >
                            {titleCase(credential.exposurePosture)}
                          </span>
                        </td>
                        <td>
                          <strong>
                            v
                            {credential.currentVersion?.version ??
                              credential.versions[0]?.version ??
                              "—"}
                          </strong>
                          <small>
                            <LocalTimestamp timestamp={credential.updatedAt} />
                          </small>
                        </td>
                        <td className={styles.numericCell}>
                          {credential.openCaseCount}
                        </td>
                        <td>
                          <button
                            aria-label={`Open ${credential.service} credential for ${credential.protecteeName}`}
                            className={styles.rowAction}
                            onClick={() => selectCredential(credential.id)}
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
                  <strong>No credentials match this view</strong>
                  <p>Clear the filters or add a managed credential.</p>
                  <button onClick={openCredentialCreate} type="button">
                    Add credential
                  </button>
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
              {view === "credentials"
                ? `${filteredCredentials.length} of ${dashboard.credentials.length} credentials`
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
            onBackToPerson={
              selectedProtectee
                ? () => setSelectedCredentialId(undefined)
                : undefined
            }
            onClose={() => setSelectedCredentialId(undefined)}
            onManagePerson={() =>
              router.push(`/home?person=${selectedCredential.protecteeId}`)
            }
            onRefresh={() => router.refresh()}
            protectee={dashboard.protectees.find(
              (protectee) => protectee.id === selectedCredential.protecteeId,
            )}
          />
        ) : selectedProtectee ? (
          <CredSignalDossier
            activeOperatorId={activeOperatorId}
            key={selectedProtectee.id}
            onClose={() => setSelectedProtecteeId(undefined)}
            onManage={() => router.push(`/home?person=${selectedProtectee.id}`)}
            onSelectCredential={setSelectedCredentialId}
            onTabChange={setDossierTab}
            operators={dashboard.operators}
            protectee={selectedProtectee}
            tab={dossierTab}
          />
        ) : null}
      </div>

      <CredSignalActivity activity={dashboard.recentActivity} />
    </div>
  );
}
