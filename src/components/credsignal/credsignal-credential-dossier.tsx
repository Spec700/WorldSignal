"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  changeManagedCredentialStatusAction,
  revealManagedCredentialAction,
  rotateManagedCredentialAction,
} from "@/app/credsignal/actions";
import {
  initialCredSignalActionState,
  type CredSignalActionState,
} from "@/features/credsignal/action-state";
import type {
  CredSignalCredentialDto,
  CredSignalProtecteeDto,
} from "@/features/credsignal/types";
import { LocalTimestamp } from "@/components/local-timestamp";

import styles from "@/app/credsignal/credsignal.module.css";

interface CredSignalCredentialDossierProps {
  credential: CredSignalCredentialDto;
  protectee?: CredSignalProtecteeDto;
  activeOperatorId: string;
  onClose: () => void;
  onManagePerson: () => void;
  onRefresh: () => void;
}

function titleCase(value: string) {
  return value
    .split("_")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function FormButton({ idleLabel }: { idleLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      className={styles.managementSubmit}
      disabled={pending}
      type="submit"
    >
      {pending ? "Saving…" : idleLabel}
    </button>
  );
}

function ActionNotice({ state }: { state: CredSignalActionState }) {
  return state.message ? (
    <div
      className={styles.actionNotice}
      data-status={state.status}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </div>
  ) : null;
}

export function CredSignalCredentialDossier({
  credential,
  protectee,
  activeOperatorId,
  onClose,
  onManagePerson,
  onRefresh,
}: CredSignalCredentialDossierProps) {
  const [revealedValue, setRevealedValue] = useState<string>();
  const [revealNotice, setRevealNotice] = useState<CredSignalActionState>(
    initialCredSignalActionState,
  );
  const [revealPending, setRevealPending] = useState(false);

  const rotate = useCallback(
    async (previousState: CredSignalActionState, formData: FormData) => {
      const result = await rotateManagedCredentialAction(
        previousState,
        formData,
      );
      if (result.status === "success") {
        setRevealedValue(undefined);
        onRefresh();
      }
      return result;
    },
    [onRefresh],
  );
  const changeStatus = useCallback(
    async (previousState: CredSignalActionState, formData: FormData) => {
      const result = await changeManagedCredentialStatusAction(
        previousState,
        formData,
      );
      if (result.status === "success") {
        setRevealedValue(undefined);
        onRefresh();
      }
      return result;
    },
    [onRefresh],
  );
  const [rotateState, rotateAction] = useActionState(
    rotate,
    initialCredSignalActionState,
  );
  const [statusState, statusAction] = useActionState(
    changeStatus,
    initialCredSignalActionState,
  );

  useEffect(() => {
    if (!revealedValue) {
      return;
    }
    const timeout = window.setTimeout(
      () => setRevealedValue(undefined),
      60_000,
    );
    return () => window.clearTimeout(timeout);
  }, [revealedValue]);

  async function revealCredential() {
    setRevealPending(true);
    const result = await revealManagedCredentialAction(
      credential.id,
      activeOperatorId || undefined,
    );
    setRevealNotice(result);
    setRevealedValue(result.status === "success" ? result.value : undefined);
    setRevealPending(false);
  }

  async function copyCredential() {
    if (!revealedValue) {
      return;
    }
    try {
      await navigator.clipboard.writeText(revealedValue);
      setRevealNotice({
        status: "success",
        message: "Credential copied to the clipboard.",
      });
    } catch {
      setRevealNotice({
        status: "error",
        message:
          "The browser blocked clipboard access. Select and copy the revealed value manually.",
      });
    }
  }

  return (
    <aside
      aria-label={`Credential record for ${credential.accountIdentifier}`}
      className={styles.dossier}
    >
      <header
        className={styles.dossierHeader}
        data-priority={credential.exposurePosture}
      >
        <span className={styles.eyebrow}>Managed credential</span>
        <button
          className={styles.manageProtecteeAction}
          onClick={onManagePerson}
          type="button"
        >
          Manage person
        </button>
        <button
          aria-label="Close credential details"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
        <h2>{credential.service}</h2>
        <p>
          {credential.protecteeName} · {credential.accountIdentifier}
        </p>
        <dl className={styles.dossierSummary}>
          <div>
            <dt>Status</dt>
            <dd>{titleCase(credential.status)}</dd>
          </div>
          <div>
            <dt>Posture</dt>
            <dd>{titleCase(credential.exposurePosture)}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{credential.currentVersion?.version ?? "—"}</dd>
          </div>
        </dl>
      </header>

      <div className={styles.dossierBody}>
        <section className={styles.dossierSection}>
          <h3>Credential record</h3>
          <dl className={styles.factList}>
            <div>
              <dt>Person</dt>
              <dd>{protectee?.displayName ?? credential.protecteeName}</dd>
            </div>
            <div>
              <dt>Organization</dt>
              <dd>{protectee?.organization ?? "Independent"}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{titleCase(credential.credentialKind)}</dd>
            </div>
            <div>
              <dt>Domain</dt>
              <dd>{credential.serviceDomain ?? "Not recorded"}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>
                <LocalTimestamp timestamp={credential.updatedAt} />
              </dd>
            </div>
            <div>
              <dt>Open cases</dt>
              <dd>{credential.openCaseCount}</dd>
            </div>
          </dl>
          {credential.notes ? (
            <p className={styles.credentialNotes}>{credential.notes}</p>
          ) : null}

          <div className={styles.secretBlock}>
            <span>Active credential value</span>
            <code>{revealedValue ?? "••••••••••••••••"}</code>
            <div>
              {credential.currentVersion ? (
                <button
                  disabled={revealPending}
                  onClick={revealCredential}
                  type="button"
                >
                  {revealPending
                    ? "Revealing…"
                    : revealedValue
                      ? "Reveal again"
                      : "Reveal and audit"}
                </button>
              ) : null}
              {revealedValue ? (
                <button onClick={copyCredential} type="button">
                  Copy value
                </button>
              ) : null}
              {revealedValue ? (
                <button
                  onClick={() => setRevealedValue(undefined)}
                  type="button"
                >
                  Hide
                </button>
              ) : null}
            </div>
          </div>
          <ActionNotice state={revealNotice} />
        </section>

        <section className={styles.dossierSection}>
          <h3>Exposure posture</h3>
          {credential.exposures.length > 0 ? (
            <div className={styles.exposureList}>
              {credential.exposures.map((exposure) => (
                <article
                  className={styles.exposureCard}
                  data-priority={exposure.severity}
                  key={exposure.id}
                >
                  <div className={styles.exposureHeading}>
                    <span>{exposure.severity}</span>
                    <strong>{exposure.sourceName}</strong>
                    <small>{titleCase(exposure.status)}</small>
                  </div>
                  <dl className={styles.factList}>
                    <div>
                      <dt>Observed</dt>
                      <dd>
                        <LocalTimestamp timestamp={exposure.observedAt} />
                      </dd>
                    </div>
                    <div>
                      <dt>Identity</dt>
                      <dd>{exposure.exposedIdentity}</dd>
                    </div>
                    <div>
                      <dt>Confidence</dt>
                      <dd>{titleCase(exposure.confidence)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <p className={styles.emptyCopy}>
              No exposure evidence is linked to this credential.
            </p>
          )}
        </section>

        <section className={styles.dossierSection}>
          <h3>Version history</h3>
          <ol className={styles.credentialVersionList}>
            {credential.versions.map((version) => (
              <li key={version.id}>
                <span>v{version.version}</span>
                <strong>{titleCase(version.status)}</strong>
                <small>
                  <LocalTimestamp timestamp={version.activatedAt} />
                </small>
              </li>
            ))}
          </ol>
        </section>

        {credential.status !== "retired" ? (
          <section className={styles.managementSection}>
            <header>
              <span className={styles.formSectionLabel}>Rotate value</span>
              <p>
                Creates a new active version and permanently supersedes the old
                value.
              </p>
            </header>
            <form action={rotateAction} className={styles.managementForm}>
              <input
                name="actorOperatorId"
                type="hidden"
                value={activeOperatorId}
              />
              <input name="credentialId" type="hidden" value={credential.id} />
              <label>
                <span>Replacement credential value</span>
                <input
                  autoComplete="new-password"
                  name="credentialValue"
                  placeholder="Synthetic replacement value"
                  required
                  type="password"
                />
              </label>
              <label>
                <span>Rotation notes</span>
                <textarea
                  name="notes"
                  placeholder="Why this credential was rotated."
                />
              </label>
              <ActionNotice state={rotateState} />
              <FormButton
                idleLabel={
                  credential.status === "revoked"
                    ? "Rotate and reactivate"
                    : "Rotate credential"
                }
              />
            </form>
          </section>
        ) : null}

        {credential.status !== "retired" ? (
          <section className={styles.managementSection}>
            <header>
              <span className={styles.formSectionLabel}>Lifecycle</span>
              <p>
                Revocation can be reversed only by rotation. Retirement is a
                terminal state for this inventory record.
              </p>
            </header>
            <form action={statusAction} className={styles.managementForm}>
              <input
                name="actorOperatorId"
                type="hidden"
                value={activeOperatorId}
              />
              <input name="credentialId" type="hidden" value={credential.id} />
              <label>
                <span>New status</span>
                <select
                  defaultValue={
                    credential.status === "revoked" ? "retired" : "revoked"
                  }
                  name="status"
                >
                  {credential.status !== "revoked" ? (
                    <option value="revoked">Revoked</option>
                  ) : null}
                  <option value="retired">Retired</option>
                </select>
              </label>
              <label>
                <span>Status rationale</span>
                <textarea
                  name="reason"
                  placeholder="Record the operational decision."
                  required
                />
              </label>
              <ActionNotice state={statusState} />
              <FormButton idleLabel="Apply lifecycle change" />
            </form>
          </section>
        ) : null}
      </div>
    </aside>
  );
}
