"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  revealCredentialAction,
  transitionCaseAction,
} from "@/app/credsignal/actions";
import {
  credentialPostureForProtectee,
  credentialPriorityForProtectee,
} from "@/components/credsignal/credsignal-globe-model";
import type { CredSignalActionState } from "@/features/credsignal/action-state";
import type {
  CredSignalCaseDto,
  CredSignalOperatorDto,
  CredSignalProtecteeDto,
} from "@/features/credsignal/types";
import { formatLocalTimestamp } from "@/lib/time/format";

import styles from "@/app/credsignal/credsignal.module.css";

import { CredSignalCommunications } from "./credsignal-communications";
import { CredSignalCaseOperations } from "./credsignal-case-operations";

export type CredSignalDossierTab = "overview" | "exposures" | "cases";

interface CredSignalDossierProps {
  protectee: CredSignalProtecteeDto;
  operators: CredSignalOperatorDto[];
  tab: CredSignalDossierTab;
  activeOperatorId: string;
  onTabChange: (tab: CredSignalDossierTab) => void;
  onManage: () => void;
  onClose: () => void;
}

const nextCaseStatuses: Record<
  CredSignalCaseDto["status"],
  CredSignalCaseDto["status"][]
> = {
  open: ["investigating", "dismissed"],
  investigating: ["notifying", "remediating", "monitoring", "dismissed"],
  notifying: ["remediating", "monitoring", "dismissed"],
  remediating: ["monitoring", "closed", "dismissed"],
  monitoring: ["remediating", "closed", "dismissed"],
  closed: ["investigating"],
  dismissed: ["investigating"],
};

function titleCase(value: string) {
  return value
    .split("_")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

export function CredSignalDossier({
  protectee,
  operators,
  tab,
  activeOperatorId,
  onTabChange,
  onManage,
  onClose,
}: CredSignalDossierProps) {
  const router = useRouter();
  const credentialPosture = credentialPostureForProtectee(protectee);
  const managedCredentialCount = protectee.credentials.filter(
    (credential) => credential.status !== "retired",
  ).length;
  const exposedCredentialCount = protectee.credentials.filter(
    (credential) =>
      credential.exposurePosture === "potential_exposure" ||
      credential.exposurePosture === "confirmed_exposure" ||
      credential.exposurePosture === "in_response",
  ).length;
  const [pendingId, setPendingId] = useState<string>();
  const [notice, setNotice] = useState<CredSignalActionState>();
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>(
    {},
  );

  useEffect(() => {
    if (Object.keys(revealedValues).length === 0) {
      return;
    }
    const timeout = window.setTimeout(() => setRevealedValues({}), 60_000);
    return () => window.clearTimeout(timeout);
  }, [revealedValues]);

  async function runMutation(
    id: string,
    mutation: () => Promise<CredSignalActionState>,
  ) {
    setPendingId(id);
    const result = await mutation();
    setNotice(result);
    setPendingId(undefined);
    if (result.status === "success") {
      router.refresh();
    }
  }

  async function reveal(exposureId: string) {
    if (revealedValues[exposureId]) {
      setRevealedValues((values) => {
        const next = { ...values };
        delete next[exposureId];
        return next;
      });
      return;
    }
    setPendingId(exposureId);
    const result = await revealCredentialAction(
      exposureId,
      activeOperatorId || undefined,
    );
    setNotice(result);
    setPendingId(undefined);
    if (result.status === "success" && result.value) {
      setRevealedValues((values) => ({
        ...values,
        [exposureId]: result.value!,
      }));
      router.refresh();
    }
  }

  async function copyCredential(exposureId: string) {
    const value = revealedValues[exposureId];
    if (!value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setNotice({
        status: "success",
        message: "Credential copied to the clipboard.",
      });
    } catch {
      setNotice({
        status: "error",
        message:
          "The browser blocked clipboard access. Select and copy the revealed value manually.",
      });
    }
  }

  return (
    <aside
      className={styles.dossier}
      aria-label={`${protectee.displayName} credential dossier`}
    >
      <div
        className={styles.dossierHeader}
        data-priority={credentialPriorityForProtectee(protectee)}
      >
        <span className={styles.eyebrow}>Person credential dossier</span>
        <button
          className={styles.manageProtecteeAction}
          onClick={onManage}
          type="button"
        >
          Manage
        </button>
        <button
          aria-label="Close protectee dossier"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
        <h2>{protectee.displayName}</h2>
        <p>
          {protectee.title ?? "Protected person"}
          {protectee.organization ? ` · ${protectee.organization}` : ""}
        </p>
        <dl className={styles.dossierSummary}>
          <div>
            <dt>Credentials</dt>
            <dd>{managedCredentialCount}</dd>
          </div>
          <div>
            <dt>Exposed</dt>
            <dd>{exposedCredentialCount}</dd>
          </div>
          <div>
            <dt>Posture</dt>
            <dd>{titleCase(credentialPosture)}</dd>
          </div>
        </dl>
      </div>

      <div
        className={styles.dossierTabs}
        role="tablist"
        aria-label="Dossier sections"
      >
        {(["overview", "exposures", "cases"] as const).map((entry) => (
          <button
            aria-selected={tab === entry}
            key={entry}
            onClick={() => onTabChange(entry)}
            role="tab"
            type="button"
          >
            {titleCase(entry)}
            {entry === "exposures" ? ` ${protectee.exposures.length}` : ""}
            {entry === "cases" ? ` ${protectee.cases.length}` : ""}
          </button>
        ))}
      </div>

      {notice?.message ? (
        <div
          className={styles.dossierNotice}
          data-status={notice.status}
          role={notice.status === "error" ? "alert" : "status"}
        >
          {notice.message}
        </div>
      ) : null}

      <div className={styles.dossierBody} role="tabpanel">
        {tab === "overview" ? (
          <>
            <section className={styles.dossierSection}>
              <h3>Operational location</h3>
              {protectee.location ? (
                <dl className={styles.factList}>
                  <div>
                    <dt>Location</dt>
                    <dd>{protectee.location.label}</dd>
                  </div>
                  <div>
                    <dt>Precision</dt>
                    <dd>{protectee.location.precision}</dd>
                  </div>
                  <div>
                    <dt>Coordinates</dt>
                    <dd>
                      {protectee.location.latitude.toFixed(4)},{" "}
                      {protectee.location.longitude.toFixed(4)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className={styles.emptyCopy}>No active map location.</p>
              )}
            </section>
            <section className={styles.dossierSection}>
              <h3>Approved identities</h3>
              <ul className={styles.identityList}>
                {protectee.identities.map((identity) => (
                  <li data-active={identity.isActive} key={identity.id}>
                    <span>{titleCase(identity.type)}</span>
                    <strong>{identity.displayValue}</strong>
                    <small>
                      {identity.isActive
                        ? identity.isPrimary
                          ? "Primary"
                          : "Active"
                        : "Inactive"}
                    </small>
                  </li>
                ))}
              </ul>
            </section>
            <section className={styles.dossierSection}>
              <h3>Managed credentials</h3>
              {protectee.credentials.length > 0 ? (
                <>
                  <ul className={styles.personCredentialList}>
                    {protectee.credentials.map((credential) => (
                      <li
                        data-posture={credential.exposurePosture}
                        key={credential.id}
                      >
                        <div>
                          <strong>{credential.service}</strong>
                          <small>{credential.accountIdentifier}</small>
                        </div>
                        <span>{titleCase(credential.status)}</span>
                        <small>{titleCase(credential.exposurePosture)}</small>
                      </li>
                    ))}
                  </ul>
                  <Link
                    className={styles.credentialInventoryLink}
                    href="/credsignal"
                  >
                    Open credential inventory →
                  </Link>
                </>
              ) : (
                <p className={styles.emptyCopy}>
                  No managed credentials are recorded for this person.
                </p>
              )}
            </section>
            <section className={styles.dossierSection}>
              <h3>Immediate work</h3>
              {protectee.cases
                .filter(
                  (responseCase) =>
                    responseCase.status !== "closed" &&
                    responseCase.status !== "dismissed",
                )
                .slice(0, 3)
                .map((responseCase) => (
                  <button
                    className={styles.caseJump}
                    data-priority={responseCase.priority}
                    key={responseCase.id}
                    onClick={() => onTabChange("cases")}
                    type="button"
                  >
                    <strong>{responseCase.title}</strong>
                    <span>
                      {responseCase.status} ·{" "}
                      {
                        responseCase.tasks.filter(
                          (task) =>
                            task.status !== "completed" &&
                            task.status !== "cancelled",
                        ).length
                      }{" "}
                      open tasks
                    </span>
                  </button>
                ))}
            </section>
          </>
        ) : null}

        {tab === "exposures" ? (
          <section className={styles.dossierSection}>
            <h3>Credential findings</h3>
            {protectee.exposures.length > 0 ? (
              <div className={styles.exposureList}>
                {protectee.exposures.map((exposure) => {
                  const revealedValue = revealedValues[exposure.id];
                  return (
                    <article
                      className={styles.exposureCard}
                      data-priority={exposure.severity}
                      key={exposure.id}
                    >
                      <div className={styles.exposureHeading}>
                        <span>{exposure.severity}</span>
                        <strong>{titleCase(exposure.credentialKind)}</strong>
                        <small>{exposure.status}</small>
                      </div>
                      <dl className={styles.factList}>
                        <div>
                          <dt>Identity</dt>
                          <dd>{exposure.exposedIdentity}</dd>
                        </div>
                        <div>
                          <dt>Service</dt>
                          <dd>
                            {exposure.service ??
                              exposure.serviceDomain ??
                              "Unknown"}
                          </dd>
                        </div>
                        <div>
                          <dt>Source</dt>
                          <dd>{exposure.sourceName}</dd>
                        </div>
                        <div>
                          <dt>Observed</dt>
                          <dd>{formatLocalTimestamp(exposure.observedAt)}</dd>
                        </div>
                      </dl>
                      {exposure.hasCredentialValue ? (
                        <div className={styles.secretBlock}>
                          <span>Stored credential</span>
                          <code>{revealedValue ?? "••••••••••••••••"}</code>
                          <div>
                            <button
                              disabled={pendingId === exposure.id}
                              onClick={() => void reveal(exposure.id)}
                              type="button"
                            >
                              {pendingId === exposure.id
                                ? "Decrypting…"
                                : revealedValue
                                  ? "Hide"
                                  : "Reveal and audit"}
                            </button>
                            {revealedValue ? (
                              <button
                                onClick={() => void copyCredential(exposure.id)}
                                type="button"
                              >
                                Copy
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className={styles.emptyCopy}>
                No credential findings are linked to this protectee.
              </p>
            )}
          </section>
        ) : null}

        {tab === "cases" ? (
          <section className={styles.dossierSection}>
            <h3>Response cases</h3>
            {protectee.cases.length > 0 ? (
              <div className={styles.caseList}>
                {protectee.cases.map((responseCase) => (
                  <article
                    className={styles.caseCard}
                    data-priority={responseCase.priority}
                    key={responseCase.id}
                  >
                    <header>
                      <span>{responseCase.priority}</span>
                      <strong>{responseCase.title}</strong>
                      <small>{responseCase.status}</small>
                    </header>
                    <dl className={styles.factList}>
                      <div>
                        <dt>Owner</dt>
                        <dd>{responseCase.assigneeName ?? "Unassigned"}</dd>
                      </div>
                      <div>
                        <dt>Due</dt>
                        <dd>
                          {responseCase.dueAt
                            ? formatLocalTimestamp(responseCase.dueAt)
                            : "No due date"}
                        </dd>
                      </div>
                    </dl>
                    <CredSignalCaseOperations
                      activeOperatorId={activeOperatorId}
                      operators={operators}
                      responseCase={responseCase}
                    />
                    <CredSignalCommunications
                      activeOperatorId={activeOperatorId}
                      responseCase={responseCase}
                    />
                    <form
                      action={async (formData) =>
                        runMutation(responseCase.id, () =>
                          transitionCaseAction(formData),
                        )
                      }
                      className={styles.caseTransition}
                    >
                      <input
                        name="caseId"
                        type="hidden"
                        value={responseCase.id}
                      />
                      <input
                        name="actorOperatorId"
                        type="hidden"
                        value={activeOperatorId}
                      />
                      <label>
                        <span>Next state</span>
                        <select name="status">
                          {nextCaseStatuses[responseCase.status].map(
                            (status) =>
                              status !== "closed" ||
                              responseCase.tasks.every(
                                (task) =>
                                  task.status === "completed" ||
                                  task.status === "cancelled",
                              ) ? (
                                <option key={status} value={status}>
                                  {titleCase(status)}
                                </option>
                              ) : null,
                          )}
                        </select>
                      </label>
                      <label>
                        <span>Resolution when closing</span>
                        <input
                          name="resolution"
                          placeholder="Required for close or dismiss"
                        />
                      </label>
                      {nextCaseStatuses[responseCase.status].includes(
                        "closed",
                      ) &&
                      responseCase.tasks.some(
                        (task) =>
                          task.status !== "completed" &&
                          task.status !== "cancelled",
                      ) ? (
                        <p className={styles.caseTransitionHint}>
                          Closing unlocks after every response task is complete
                          or cancelled.
                        </p>
                      ) : null}
                      <button
                        disabled={pendingId === responseCase.id}
                        type="submit"
                      >
                        {pendingId === responseCase.id
                          ? "Updating…"
                          : "Update case"}
                      </button>
                    </form>
                    {responseCase.resolution ? (
                      <p className={styles.caseResolution}>
                        <span>Resolution</span>
                        {responseCase.resolution}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles.emptyCopy}>
                No response cases are linked to this protectee.
              </p>
            )}
          </section>
        ) : null}
      </div>
    </aside>
  );
}
