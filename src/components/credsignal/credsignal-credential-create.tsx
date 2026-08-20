"use client";

import { useActionState, useCallback, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { createManagedCredentialAction } from "@/app/credsignal/actions";
import {
  initialCredSignalActionState,
  type CredSignalActionState,
} from "@/features/credsignal/action-state";
import type { CredSignalProtecteeDto } from "@/features/credsignal/types";

import styles from "@/app/credsignal/credsignal.module.css";

interface CredSignalCredentialCreateProps {
  activeOperatorId: string;
  protectees: CredSignalProtecteeDto[];
  onClose: () => void;
  onSaved: (credentialId?: string) => void;
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

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button className={styles.intakeSubmit} disabled={pending} type="submit">
      {pending ? "Encrypting credential…" : "Add managed credential"}
    </button>
  );
}

export function CredSignalCredentialCreate({
  activeOperatorId,
  protectees,
  onClose,
  onSaved,
}: CredSignalCredentialCreateProps) {
  const submitCredential = useCallback(
    async (previousState: CredSignalActionState, formData: FormData) => {
      const result = await createManagedCredentialAction(
        previousState,
        formData,
      );
      if (result.status === "success") {
        onSaved(result.createdId);
      }
      return result;
    },
    [onSaved],
  );
  const [state, action] = useActionState(
    submitCredential,
    initialCredSignalActionState,
  );
  const [protecteeId, setProtecteeId] = useState("");
  const [identityId, setIdentityId] = useState("");
  const [accountIdentifier, setAccountIdentifier] = useState("");
  const selectedProtectee = useMemo(
    () => protectees.find((protectee) => protectee.id === protecteeId),
    [protecteeId, protectees],
  );

  function chooseProtectee(nextProtecteeId: string) {
    setProtecteeId(nextProtecteeId);
    const protectee = protectees.find(
      (candidate) => candidate.id === nextProtecteeId,
    );
    const identity =
      protectee?.identities.find(
        (candidate) => candidate.isPrimary && candidate.isActive,
      ) ?? protectee?.identities.find((candidate) => candidate.isActive);
    setIdentityId(identity?.id ?? "");
    setAccountIdentifier(identity?.displayValue ?? "");
  }

  function chooseIdentity(nextIdentityId: string) {
    setIdentityId(nextIdentityId);
    const identity = selectedProtectee?.identities.find(
      (candidate) => candidate.id === nextIdentityId,
    );
    if (identity) {
      setAccountIdentifier(identity.displayValue);
    }
  }

  return (
    <aside aria-label="Add managed credential" className={styles.intakePanel}>
      <div className={styles.intakeHeader}>
        <span className={styles.eyebrow}>Credential inventory</span>
        <button
          aria-label="Close add credential"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
        <h2>Add managed credential</h2>
        <p>
          Store one active credential or token for a monitored person. Values
          are encrypted and never included in the inventory response.
        </p>
      </div>

      <form action={action} className={styles.intakeForm}>
        <input name="actorOperatorId" type="hidden" value={activeOperatorId} />

        <div className={styles.formSection}>
          <span className={styles.formSectionLabel}>Owner and account</span>
          <label className={styles.fullField}>
            <span>Person</span>
            <select
              name="protecteeId"
              onChange={(event) => chooseProtectee(event.target.value)}
              required
              value={protecteeId}
            >
              <option value="">Select a monitored person</option>
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
            <span>Approved identity</span>
            <select
              disabled={!selectedProtectee}
              name="identityId"
              onChange={(event) => chooseIdentity(event.target.value)}
              value={identityId}
            >
              <option value="">
                {selectedProtectee
                  ? "No linked identity"
                  : "Select a person first"}
              </option>
              {selectedProtectee?.identities
                .filter((identity) => identity.isActive)
                .map((identity) => (
                  <option key={identity.id} value={identity.id}>
                    {identity.type.replaceAll("_", " ")} ·{" "}
                    {identity.displayValue}
                  </option>
                ))}
            </select>
            <FieldError field="identityId" state={state} />
          </label>
          <label className={styles.fullField}>
            <span>Account identifier</span>
            <input
              autoComplete="off"
              name="accountIdentifier"
              onChange={(event) => setAccountIdentifier(event.target.value)}
              placeholder="name@example.test or service account"
              required
              value={accountIdentifier}
            />
            <FieldError field="accountIdentifier" state={state} />
          </label>
        </div>

        <div className={styles.formSection}>
          <span className={styles.formSectionLabel}>Credential record</span>
          <div className={styles.fieldPair}>
            <label>
              <span>Service</span>
              <input name="service" placeholder="Identity provider" required />
              <FieldError field="service" state={state} />
            </label>
            <label>
              <span>Type</span>
              <select defaultValue="password" name="credentialKind" required>
                <option value="password">Password</option>
                <option value="session_token">Session token</option>
                <option value="session_cookie">Session cookie</option>
                <option value="api_key">API key</option>
                <option value="other">Other secret</option>
              </select>
              <FieldError field="credentialKind" state={state} />
            </label>
          </div>
          <label className={styles.fullField}>
            <span>Service domain</span>
            <input
              autoCapitalize="none"
              autoComplete="off"
              name="serviceDomain"
              placeholder="id.example.test"
            />
            <FieldError field="serviceDomain" state={state} />
          </label>
          <label className={styles.fullField}>
            <span>Active credential value</span>
            <input
              autoComplete="new-password"
              name="credentialValue"
              placeholder="Synthetic demo value"
              required
              type="password"
            />
            <FieldError field="credentialValue" state={state} />
          </label>
          <p className={styles.formHint}>
            Demo workspace only. Use synthetic values; never enter a real
            employee password or production token.
          </p>
          <label className={styles.fullField}>
            <span>Operator notes</span>
            <textarea
              name="notes"
              placeholder="Ownership, purpose, or rotation context."
              rows={3}
            />
            <FieldError field="notes" state={state} />
          </label>
        </div>

        {state.message ? (
          <div
            className={styles.actionNotice}
            data-status={state.status}
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </div>
        ) : null}
        <SaveButton />
      </form>
    </aside>
  );
}
