"use client";

import { useActionState, useCallback, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { matchExposureAction } from "@/app/credsignal/actions";
import {
  initialCredSignalActionState,
  type CredSignalActionState,
} from "@/features/credsignal/action-state";
import type {
  CredSignalExposureDto,
  CredSignalProtecteeDto,
} from "@/features/credsignal/types";
import { formatLocalTimestamp } from "@/lib/time/format";

import styles from "@/app/credsignal/credsignal.module.css";

interface CredSignalTriageProps {
  exposure: CredSignalExposureDto;
  protectees: CredSignalProtecteeDto[];
  activeOperatorId: string;
  onClose: () => void;
  onCreateProtectee: () => void;
  onMatched: (protecteeId: string) => void;
}

function titleCase(value: string) {
  return value
    .split("_")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function credentialKindMatches(managedKind: string, exposureKind: string) {
  return (
    managedKind === exposureKind ||
    (managedKind === "password" && exposureKind === "password_hash")
  );
}

function MatchButton() {
  const { pending } = useFormStatus();

  return (
    <button className={styles.intakeSubmit} disabled={pending} type="submit">
      {pending ? "Opening response case…" : "Confirm match and open case"}
    </button>
  );
}

function FieldError({
  state,
  field,
}: {
  state: CredSignalActionState;
  field: string;
}) {
  const message = state.fieldErrors?.[field]?.[0];
  return message ? <span className={styles.fieldError}>{message}</span> : null;
}

export function CredSignalTriage({
  exposure,
  protectees,
  activeOperatorId,
  onClose,
  onCreateProtectee,
  onMatched,
}: CredSignalTriageProps) {
  const submitMatch = useCallback(
    async (previousState: CredSignalActionState, formData: FormData) => {
      const result = await matchExposureAction(previousState, formData);
      if (result.status === "success" && result.protecteeId) {
        onMatched(result.protecteeId);
      }
      return result;
    },
    [onMatched],
  );
  const [state, action] = useActionState(
    submitMatch,
    initialCredSignalActionState,
  );
  const [protecteeId, setProtecteeId] = useState("");
  const [identityId, setIdentityId] = useState("");
  const [credentialId, setCredentialId] = useState("");
  const selectedProtectee = useMemo(
    () => protectees.find((protectee) => protectee.id === protecteeId),
    [protecteeId, protectees],
  );
  const eligibleCredentials = useMemo(
    () =>
      selectedProtectee?.credentials.filter(
        (credential) =>
          credentialKindMatches(
            credential.credentialKind,
            exposure.credentialKind,
          ) &&
          (!credential.identityId || credential.identityId === identityId),
      ) ?? [],
    [exposure.credentialKind, identityId, selectedProtectee],
  );

  function chooseProtectee(nextProtecteeId: string) {
    setProtecteeId(nextProtecteeId);
    const protectee = protectees.find(
      (candidate) => candidate.id === nextProtecteeId,
    );
    const identity =
      protectee?.identities.find((candidate) => candidate.isPrimary) ??
      protectee?.identities[0];
    setIdentityId(identity?.id ?? "");
    const credentials =
      protectee?.credentials.filter(
        (credential) =>
          credentialKindMatches(
            credential.credentialKind,
            exposure.credentialKind,
          ) &&
          (!credential.identityId || credential.identityId === identity?.id),
      ) ?? [];
    setCredentialId(credentials.length === 1 ? credentials[0].id : "");
  }

  function chooseIdentity(nextIdentityId: string) {
    setIdentityId(nextIdentityId);
    const credentials =
      selectedProtectee?.credentials.filter(
        (credential) =>
          credentialKindMatches(
            credential.credentialKind,
            exposure.credentialKind,
          ) &&
          (!credential.identityId || credential.identityId === nextIdentityId),
      ) ?? [];
    setCredentialId(credentials.length === 1 ? credentials[0].id : "");
  }

  return (
    <aside
      aria-label={`Resolve unmatched exposure for ${exposure.exposedIdentity}`}
      className={styles.intakePanel}
    >
      <div className={styles.intakeHeader}>
        <span className={styles.eyebrow}>Identity triage</span>
        <button
          aria-label="Close exposure triage"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
        <h2>Resolve unmatched exposure</h2>
        <p>
          Confirm the person using an active identity already approved for
          monitoring.
        </p>
      </div>

      <form action={action} className={styles.intakeForm}>
        <input name="actorOperatorId" type="hidden" value={activeOperatorId} />
        <input name="exposureId" type="hidden" value={exposure.id} />

        <section className={styles.triageEvidence}>
          <div className={styles.triageEvidenceHeading}>
            <span data-priority={exposure.severity}>{exposure.severity}</span>
            <strong>{exposure.exposedIdentity}</strong>
            <small>{titleCase(exposure.credentialKind)}</small>
          </div>
          <dl className={styles.triageFacts}>
            <div>
              <dt>Identity type</dt>
              <dd>{titleCase(exposure.identityType)}</dd>
            </div>
            <div>
              <dt>Service</dt>
              <dd>{exposure.service ?? exposure.serviceDomain ?? "Unknown"}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{exposure.sourceName}</dd>
            </div>
            <div>
              <dt>Observed</dt>
              <dd>{formatLocalTimestamp(exposure.observedAt)}</dd>
            </div>
            <div>
              <dt>Confidence</dt>
              <dd>{exposure.confidence}</dd>
            </div>
            <div>
              <dt>Credential</dt>
              <dd>
                {exposure.hasCredentialValue
                  ? "Encrypted value retained"
                  : "No stored value"}
              </dd>
            </div>
          </dl>
          {exposure.notes ? (
            <p className={styles.triageNotes}>{exposure.notes}</p>
          ) : null}
        </section>

        {protectees.length > 0 ? (
          <div className={styles.formSection}>
            <span className={styles.formSectionLabel}>Assignment decision</span>
            <label className={styles.fullField}>
              <span>Protectee</span>
              <select
                name="protecteeId"
                onChange={(event) => chooseProtectee(event.target.value)}
                required
                value={protecteeId}
              >
                <option value="">Select the confirmed protectee</option>
                {protectees.map((protectee) => (
                  <option key={protectee.id} value={protectee.id}>
                    {protectee.displayName} ·{" "}
                    {protectee.organization ?? "Independent"}
                  </option>
                ))}
              </select>
              <FieldError field="protecteeId" state={state} />
            </label>
            <label className={styles.fullField}>
              <span>Approved identity used as evidence</span>
              <select
                disabled={!selectedProtectee}
                name="identityId"
                onChange={(event) => chooseIdentity(event.target.value)}
                required
                value={identityId}
              >
                <option value="">
                  {selectedProtectee
                    ? "Select an approved identity"
                    : "Select a protectee first"}
                </option>
                {selectedProtectee?.identities
                  .filter((identity) => identity.isActive)
                  .map((identity) => (
                    <option key={identity.id} value={identity.id}>
                      {titleCase(identity.type)} · {identity.displayValue}
                      {identity.isPrimary ? " · Primary" : ""}
                    </option>
                  ))}
              </select>
              <FieldError field="identityId" state={state} />
            </label>
            <label className={styles.fullField}>
              <span>Managed credential affected</span>
              <select
                disabled={!selectedProtectee || !identityId}
                name="credentialId"
                onChange={(event) => setCredentialId(event.target.value)}
                value={credentialId}
              >
                <option value="">
                  {selectedProtectee
                    ? "No specific credential confirmed"
                    : "Select a protectee first"}
                </option>
                {eligibleCredentials.map((credential) => (
                  <option key={credential.id} value={credential.id}>
                    {credential.service} ·{" "}
                    {titleCase(credential.credentialKind)}
                    {credential.status !== "active"
                      ? ` · ${titleCase(credential.status)}`
                      : ""}
                  </option>
                ))}
              </select>
              <FieldError field="credentialId" state={state} />
            </label>
            <p className={styles.formHint}>
              Link the evidence only when the specific inventory credential is
              known. The person match remains valid without this field.
            </p>
            <label className={styles.fullField}>
              <span>Analyst rationale</span>
              <textarea
                aria-describedby="match-rationale-hint"
                name="reason"
                placeholder="Describe the source evidence connecting this exposed identity to the protectee."
                required
                rows={4}
              />
              <FieldError field="reason" state={state} />
            </label>
            <p className={styles.formHint} id="match-rationale-hint">
              This decision is permanent, attributed to the active operator, and
              recorded in the activity history.
            </p>
          </div>
        ) : (
          <div className={styles.triageEmpty}>
            <strong>No active protectees are available</strong>
            <p>Create the person and its approved identity first.</p>
            <button onClick={onCreateProtectee} type="button">
              Create person
            </button>
          </div>
        )}

        {state.message ? (
          <div
            className={styles.actionNotice}
            data-status={state.status}
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </div>
        ) : null}
        {protectees.length > 0 ? <MatchButton /> : null}
      </form>
    </aside>
  );
}
