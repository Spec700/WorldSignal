"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { createExposureAction } from "@/app/credsignal/actions";
import {
  initialCredSignalActionState,
  type CredSignalActionState,
} from "@/features/credsignal/action-state";
import type {
  CredSignalOperatorDto,
  CredSignalProtecteeDto,
} from "@/features/credsignal/types";

import styles from "@/app/credsignal/credsignal.module.css";

interface CredSignalIntakeProps {
  operators: CredSignalOperatorDto[];
  protectees: CredSignalProtecteeDto[];
  activeOperatorId: string;
  onClose: () => void;
  onSaved: (createdId?: string) => void;
}

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button className={styles.intakeSubmit} disabled={pending} type="submit">
      {pending ? "Saving securely…" : children}
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

function ActionNotice({ state }: { state: CredSignalActionState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  return (
    <div
      className={styles.actionNotice}
      data-status={state.status}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </div>
  );
}

function ExposureForm({
  activeOperatorId,
  protectees,
  onSaved,
}: Pick<CredSignalIntakeProps, "activeOperatorId" | "protectees" | "onSaved">) {
  const [state, action] = useActionState(
    createExposureAction,
    initialCredSignalActionState,
  );
  const [selectedProtecteeId, setSelectedProtecteeId] = useState("");
  const [identityType, setIdentityType] = useState("work_email");
  const [identityValue, setIdentityValue] = useState("");
  const [observedAt, setObservedAt] = useState(() => {
    const now = new Date();
    const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
    return localNow.toISOString().slice(0, 16);
  });

  useEffect(() => {
    if (state.status === "success") {
      onSaved(state.createdId);
    }
  }, [onSaved, state.createdId, state.status]);

  function chooseProtectee(protecteeId: string) {
    setSelectedProtecteeId(protecteeId);
    const protectee = protectees.find((entry) => entry.id === protecteeId);
    const identity =
      protectee?.identities.find(
        (entry) => entry.isPrimary && entry.isActive,
      ) ?? protectee?.identities.find((entry) => entry.isActive);
    if (identity) {
      setIdentityType(identity.type);
      setIdentityValue(identity.displayValue);
    }
  }

  return (
    <form action={action} className={styles.intakeForm}>
      <input name="actorOperatorId" type="hidden" value={activeOperatorId} />
      <div className={styles.formSection}>
        <span className={styles.formSectionLabel}>Identity match</span>
        <label className={styles.fullField}>
          <span>Protectee</span>
          <select
            name="protecteeId"
            onChange={(event) => chooseProtectee(event.target.value)}
            value={selectedProtecteeId}
          >
            <option value="">Unmatched — send to triage</option>
            {protectees.map((protectee) => (
              <option key={protectee.id} value={protectee.id}>
                {protectee.displayName} ·{" "}
                {protectee.organization ?? "Independent"}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.fieldPair}>
          <label>
            <span>Identity type</span>
            <select
              name="identityType"
              onChange={(event) => setIdentityType(event.target.value)}
              value={identityType}
            >
              <option value="work_email">Work email</option>
              <option value="personal_email">Personal email</option>
              <option value="username">Username</option>
              <option value="phone">Phone</option>
              <option value="domain">Domain</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            <span>Exposed identity</span>
            <input
              autoComplete="off"
              name="identityValue"
              onChange={(event) => setIdentityValue(event.target.value)}
              required
              value={identityValue}
            />
            <FieldError field="identityValue" state={state} />
          </label>
        </div>
        <p className={styles.formHint}>
          A selected protectee must already own this exact approved identity.
        </p>
      </div>

      <div className={styles.formSection}>
        <span className={styles.formSectionLabel}>Credential artifact</span>
        <div className={styles.fieldPair}>
          <label>
            <span>Credential type</span>
            <select defaultValue="password" name="credentialKind">
              <option value="password">Password</option>
              <option value="password_hash">Password hash</option>
              <option value="session_token">Session token</option>
              <option value="session_cookie">Session cookie</option>
              <option value="api_key">API key</option>
              <option value="other">Other artifact</option>
            </select>
          </label>
          <label>
            <span>Severity</span>
            <select defaultValue="" name="severity">
              <option value="">Auto-classify</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
        </div>
        <label className={styles.fullField}>
          <span>Full credential value</span>
          <input
            autoComplete="new-password"
            name="credentialValue"
            spellCheck={false}
            type="password"
          />
          <FieldError field="credentialValue" state={state} />
        </label>
        <p className={styles.formHint}>
          Encrypted before storage. Never written to logs, URLs, or browser
          storage.
        </p>
        <div className={styles.fieldPair}>
          <label>
            <span>Service</span>
            <input autoComplete="off" name="service" />
          </label>
          <label>
            <span>Service domain</span>
            <input
              autoComplete="off"
              name="serviceDomain"
              placeholder="login.example.com"
            />
          </label>
        </div>
      </div>

      <div className={styles.formSection}>
        <span className={styles.formSectionLabel}>Source and observation</span>
        <div className={styles.fieldPair}>
          <label>
            <span>Source type</span>
            <select defaultValue="breach" name="sourceType">
              <option value="breach">Breach</option>
              <option value="infostealer">Infostealer</option>
              <option value="phishing">Phishing</option>
              <option value="combolist">Combo list</option>
              <option value="paste">Paste</option>
              <option value="internal_report">Internal report</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            <span>Confidence</span>
            <select defaultValue="medium" name="confidence">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="confirmed">Confirmed</option>
            </select>
          </label>
        </div>
        <label className={styles.fullField}>
          <span>Source name</span>
          <input autoComplete="off" name="sourceName" required />
          <FieldError field="sourceName" state={state} />
        </label>
        <div className={styles.fieldPair}>
          <label>
            <span>Source record ID</span>
            <input autoComplete="off" name="sourceRecordId" />
          </label>
          <label>
            <span>Observed at</span>
            <input
              name="observedAt"
              onChange={(event) => setObservedAt(event.target.value)}
              required
              type="datetime-local"
              value={observedAt}
            />
            <FieldError field="observedAt" state={state} />
          </label>
        </div>
        <label className={styles.fullField}>
          <span>Analyst notes</span>
          <textarea name="notes" rows={3} />
        </label>
      </div>

      <ActionNotice state={state} />
      <SubmitButton>Record exposure</SubmitButton>
    </form>
  );
}

export function CredSignalIntake({
  operators,
  protectees,
  activeOperatorId,
  onClose,
  onSaved,
}: CredSignalIntakeProps) {
  const activeOperator = operators.find(
    (operator) => operator.id === activeOperatorId,
  );

  return (
    <aside className={styles.intakePanel} aria-label="Exposure intake">
      <div className={styles.intakeHeader}>
        <span className={styles.eyebrow}>Manual intelligence intake</span>
        <button aria-label="Close intake panel" onClick={onClose} type="button">
          ×
        </button>
        <h2>Record exposure</h2>
        <p>
          Attributed to{" "}
          {activeOperator?.displayName ?? "an unattributed local operator"}.
          Authentication is not enforced in this demo.
        </p>
      </div>
      <ExposureForm
        activeOperatorId={activeOperatorId}
        onSaved={onSaved}
        protectees={protectees}
      />
    </aside>
  );
}
