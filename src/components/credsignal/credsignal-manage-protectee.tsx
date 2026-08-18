"use client";

import {
  useActionState,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";

import {
  addProtecteeIdentityAction,
  deactivateProtecteeIdentityAction,
  replaceProtecteeLocationAction,
  setPrimaryProtecteeIdentityAction,
  updateProtecteeAction,
} from "@/app/credsignal/actions";
import {
  initialCredSignalActionState,
  type CredSignalActionState,
} from "@/features/credsignal/action-state";
import type { CredSignalProtecteeDto } from "@/features/credsignal/types";

import styles from "@/app/credsignal/credsignal.module.css";

interface CredSignalManageProtecteeProps {
  protectee: CredSignalProtecteeDto;
  activeOperatorId: string;
  onClose: () => void;
}

function titleCase(value: string) {
  return value
    .split("_")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
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
  if (!state.message) {
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

function SaveButton({
  children,
  pendingLabel,
}: {
  children: ReactNode;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className={styles.managementSubmit}
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

function ProfileForm({
  protectee,
  activeOperatorId,
}: Omit<CredSignalManageProtecteeProps, "onClose">) {
  const [displayName, setDisplayName] = useState(protectee.displayName);
  const [title, setTitle] = useState(protectee.title ?? "");
  const [organization, setOrganization] = useState(
    protectee.organization ?? "",
  );
  const [tier, setTier] = useState(protectee.tier);
  const [status, setStatus] = useState(protectee.status);
  const submit = useCallback(
    async (previousState: CredSignalActionState, formData: FormData) => {
      return updateProtecteeAction(previousState, formData);
    },
    [],
  );
  const [state, action] = useActionState(submit, initialCredSignalActionState);

  return (
    <section className={styles.managementSection}>
      <header>
        <span className={styles.formSectionLabel}>Profile and lifecycle</span>
        <p>Paused protectees stay searchable but stop automatic matching.</p>
      </header>
      <form
        action={action}
        className={styles.managementForm}
        onReset={(event) => event.preventDefault()}
      >
        <input name="actorOperatorId" type="hidden" value={activeOperatorId} />
        <input name="protecteeId" type="hidden" value={protectee.id} />
        <label className={styles.fullField}>
          <span>Full name</span>
          <input
            name="displayName"
            onChange={(event) => setDisplayName(event.target.value)}
            required
            value={displayName}
          />
          <FieldError field="displayName" state={state} />
        </label>
        <div className={styles.fieldPair}>
          <label>
            <span>Title</span>
            <input
              name="title"
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </label>
          <label>
            <span>Organization</span>
            <input
              name="organization"
              onChange={(event) => setOrganization(event.target.value)}
              value={organization}
            />
          </label>
        </div>
        <div className={styles.fieldPair}>
          <label>
            <span>Monitoring tier</span>
            <select
              name="tier"
              onChange={(event) =>
                setTier(event.target.value as CredSignalProtecteeDto["tier"])
              }
              value={tier}
            >
              <option value="standard">Standard</option>
              <option value="high">High attention</option>
              <option value="critical">Critical protectee</option>
            </select>
          </label>
          <label>
            <span>Roster status</span>
            <select
              name="status"
              onChange={(event) =>
                setStatus(
                  event.target.value as CredSignalProtecteeDto["status"],
                )
              }
              value={status}
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>
        <p className={styles.formHint}>
          Archiving is available only after every response case is closed or
          dismissed.
        </p>
        <ActionNotice state={state} />
        <SaveButton pendingLabel="Saving profile…">Save profile</SaveButton>
      </form>
    </section>
  );
}

function IdentitySection({
  protectee,
  activeOperatorId,
}: Omit<CredSignalManageProtecteeProps, "onClose">) {
  const formRef = useRef<HTMLFormElement>(null);
  const submit = useCallback(
    async (previousState: CredSignalActionState, formData: FormData) => {
      const result = await addProtecteeIdentityAction(previousState, formData);
      if (result.status === "success") {
        formRef.current?.reset();
      }
      return result;
    },
    [],
  );
  const [state, action] = useActionState(submit, initialCredSignalActionState);
  const [pendingIdentityId, setPendingIdentityId] = useState<string>();
  const [identityNotice, setIdentityNotice] = useState<CredSignalActionState>();

  async function updateIdentity(
    identityId: string,
    mutation: (formData: FormData) => Promise<CredSignalActionState>,
  ) {
    setPendingIdentityId(identityId);
    const formData = new FormData();
    formData.set("identityId", identityId);
    formData.set("actorOperatorId", activeOperatorId);
    const result = await mutation(formData);
    setIdentityNotice(result);
    setPendingIdentityId(undefined);
  }

  return (
    <section className={styles.managementSection}>
      <header>
        <span className={styles.formSectionLabel}>Approved identities</span>
        <p>Matching considers active identities on active protectees only.</p>
      </header>
      <ul className={styles.managementIdentityList}>
        {protectee.identities.map((identity) => (
          <li data-active={identity.isActive} key={identity.id}>
            <span>
              <strong>{identity.displayValue}</strong>
              <small>
                {titleCase(identity.type)} ·{" "}
                {identity.isActive ? "Active" : "Inactive"}
              </small>
            </span>
            <div>
              {identity.isActive && identity.isPrimary ? (
                <span className={styles.primaryIdentityBadge}>Primary</span>
              ) : null}
              {identity.isActive && !identity.isPrimary ? (
                <>
                  <button
                    disabled={pendingIdentityId === identity.id}
                    onClick={() =>
                      void updateIdentity(
                        identity.id,
                        setPrimaryProtecteeIdentityAction,
                      )
                    }
                    type="button"
                  >
                    Make primary
                  </button>
                  <button
                    disabled={pendingIdentityId === identity.id}
                    onClick={() =>
                      void updateIdentity(
                        identity.id,
                        deactivateProtecteeIdentityAction,
                      )
                    }
                    type="button"
                  >
                    Deactivate
                  </button>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {identityNotice ? <ActionNotice state={identityNotice} /> : null}
      <form action={action} className={styles.managementForm} ref={formRef}>
        <input name="actorOperatorId" type="hidden" value={activeOperatorId} />
        <input name="protecteeId" type="hidden" value={protectee.id} />
        <div className={styles.fieldPair}>
          <label>
            <span>Identity type</span>
            <select defaultValue="work_email" name="type">
              <option value="work_email">Work email</option>
              <option value="personal_email">Personal email</option>
              <option value="username">Username</option>
              <option value="phone">Phone</option>
              <option value="domain">Domain</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            <span>Identity value</span>
            <input autoComplete="off" name="value" required />
            <FieldError field="value" state={state} />
          </label>
        </div>
        <label className={styles.checkField}>
          <input name="makePrimary" type="checkbox" />
          <span>Make this the primary identity</span>
        </label>
        <p className={styles.formHint}>
          Re-adding an inactive identity reactivates its historical record.
        </p>
        <ActionNotice state={state} />
        <SaveButton pendingLabel="Adding identity…">Add identity</SaveButton>
      </form>
    </section>
  );
}

function LocationForm({
  protectee,
  activeOperatorId,
}: Omit<CredSignalManageProtecteeProps, "onClose">) {
  const [label, setLabel] = useState(protectee.location?.label ?? "");
  const [latitude, setLatitude] = useState(
    protectee.location?.latitude.toString() ?? "",
  );
  const [longitude, setLongitude] = useState(
    protectee.location?.longitude.toString() ?? "",
  );
  const [precision, setPrecision] = useState(
    protectee.location?.precision ?? "city",
  );
  const submit = useCallback(
    async (previousState: CredSignalActionState, formData: FormData) => {
      return replaceProtecteeLocationAction(previousState, formData);
    },
    [],
  );
  const [state, action] = useActionState(submit, initialCredSignalActionState);

  return (
    <section className={styles.managementSection}>
      <header>
        <span className={styles.formSectionLabel}>Operational location</span>
        <p>Replacing a location closes the old record without deleting it.</p>
      </header>
      <form
        action={action}
        className={styles.managementForm}
        onReset={(event) => event.preventDefault()}
      >
        <input name="actorOperatorId" type="hidden" value={activeOperatorId} />
        <input name="protecteeId" type="hidden" value={protectee.id} />
        <label className={styles.fullField}>
          <span>Location label</span>
          <input
            name="label"
            onChange={(event) => setLabel(event.target.value)}
            required
            value={label}
          />
          <FieldError field="label" state={state} />
        </label>
        <div className={styles.fieldPair}>
          <label>
            <span>Latitude</span>
            <input
              max="90"
              min="-90"
              name="latitude"
              onChange={(event) => setLatitude(event.target.value)}
              required
              step="any"
              type="number"
              value={latitude}
            />
            <FieldError field="latitude" state={state} />
          </label>
          <label>
            <span>Longitude</span>
            <input
              max="180"
              min="-180"
              name="longitude"
              onChange={(event) => setLongitude(event.target.value)}
              required
              step="any"
              type="number"
              value={longitude}
            />
            <FieldError field="longitude" state={state} />
          </label>
        </div>
        <label>
          <span>Precision</span>
          <select
            name="precision"
            onChange={(event) =>
              setPrecision(
                event.target.value as NonNullable<
                  CredSignalProtecteeDto["location"]
                >["precision"],
              )
            }
            value={precision}
          >
            <option value="exact">Exact approved point</option>
            <option value="city">City</option>
            <option value="region">Region</option>
            <option value="country">Country</option>
          </select>
        </label>
        <p className={styles.formHint}>
          This is an operator-maintained location, not live device tracking.
        </p>
        <ActionNotice state={state} />
        <SaveButton pendingLabel="Replacing location…">
          Replace location
        </SaveButton>
      </form>
    </section>
  );
}

export function CredSignalManageProtectee({
  protectee,
  activeOperatorId,
  onClose,
}: CredSignalManageProtecteeProps) {
  return (
    <aside
      aria-label={`Manage ${protectee.displayName}`}
      className={styles.intakePanel}
    >
      <div className={styles.intakeHeader}>
        <span className={styles.eyebrow}>Roster administration</span>
        <button
          aria-label="Close protectee management"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
        <h2>Manage {protectee.displayName}</h2>
        <p>Changes are attributed to the active operator and retained.</p>
      </div>
      <div className={styles.managementBody}>
        <ProfileForm
          activeOperatorId={activeOperatorId}
          protectee={protectee}
        />
        <IdentitySection
          activeOperatorId={activeOperatorId}
          protectee={protectee}
        />
        <LocationForm
          activeOperatorId={activeOperatorId}
          protectee={protectee}
        />
      </div>
    </aside>
  );
}
