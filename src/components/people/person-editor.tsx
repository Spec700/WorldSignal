"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";

import {
  addPersonIdentityAction,
  createPersonAction,
  deactivatePersonIdentityAction,
  replacePersonLocationAction,
  setPrimaryPersonIdentityAction,
  updatePersonAction,
} from "@/app/home/actions";
import {
  initialPeopleActionState,
  type PeopleActionState,
} from "@/features/people/action-state";
import type { PersonDto } from "@/features/people/types";

import styles from "@/app/home/home.module.css";

interface PersonEditorProps {
  mode: "create" | "manage";
  person?: PersonDto;
  activeOperatorId: string;
  onClose: () => void;
  onSaved: (personId?: string) => void;
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
  state: PeopleActionState;
  field: string;
}) {
  const message = state.fieldErrors?.[field]?.[0];
  return message ? <span className={styles.fieldError}>{message}</span> : null;
}

function ActionNotice({ state }: { state?: PeopleActionState }) {
  if (!state?.message) {
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

function SubmitButton({
  children,
  pendingLabel,
}: {
  children: ReactNode;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button className={styles.submitAction} disabled={pending} type="submit">
      {pending ? pendingLabel : children}
    </button>
  );
}

function CreatePersonForm({
  activeOperatorId,
  onSaved,
}: Pick<PersonEditorProps, "activeOperatorId" | "onSaved">) {
  const [state, action] = useActionState(
    createPersonAction,
    initialPeopleActionState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSaved(state.createdId);
    }
  }, [onSaved, state.createdId, state.status]);

  return (
    <form action={action} className={styles.editorForm}>
      <input name="actorOperatorId" type="hidden" value={activeOperatorId} />

      <section className={styles.formSection}>
        <span className={styles.formSectionLabel}>Profile</span>
        <label className={styles.fullField}>
          <span>Full name</span>
          <input autoComplete="off" name="displayName" required />
          <FieldError field="displayName" state={state} />
        </label>
        <div className={styles.fieldPair}>
          <label>
            <span>Title</span>
            <input autoComplete="off" name="title" />
            <FieldError field="title" state={state} />
          </label>
          <label>
            <span>Organization</span>
            <input autoComplete="off" name="organization" />
            <FieldError field="organization" state={state} />
          </label>
        </div>
        <label className={styles.fullField}>
          <span>Protection tier</span>
          <select defaultValue="standard" name="tier">
            <option value="standard">Standard</option>
            <option value="high">High attention</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <label className={styles.fullField}>
          <span>Protection context</span>
          <textarea
            name="notes"
            placeholder="Role, travel pattern, or operator context relevant across signals."
            rows={3}
          />
          <FieldError field="notes" state={state} />
        </label>
      </section>

      <section className={styles.formSection}>
        <span className={styles.formSectionLabel}>Primary identity</span>
        <div className={styles.fieldPair}>
          <label>
            <span>Identity type</span>
            <select defaultValue="work_email" name="identityType">
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
            <input autoComplete="off" name="identityValue" required />
            <FieldError field="identityValue" state={state} />
          </label>
        </div>
        <p className={styles.formHint}>
          Signal modules use approved identities for correlation. Synthetic
          values are appropriate for this demo.
        </p>
      </section>

      <section className={styles.formSection}>
        <span className={styles.formSectionLabel}>Approved location</span>
        <label className={styles.fullField}>
          <span>City, office, or region label</span>
          <input autoComplete="off" name="locationLabel" required />
          <FieldError field="locationLabel" state={state} />
        </label>
        <div className={styles.fieldPair}>
          <label>
            <span>Latitude</span>
            <input
              inputMode="decimal"
              max="90"
              min="-90"
              name="latitude"
              required
              step="any"
              type="number"
            />
            <FieldError field="latitude" state={state} />
          </label>
          <label>
            <span>Longitude</span>
            <input
              inputMode="decimal"
              max="180"
              min="-180"
              name="longitude"
              required
              step="any"
              type="number"
            />
            <FieldError field="longitude" state={state} />
          </label>
        </div>
        <label className={styles.fullField}>
          <span>Precision</span>
          <select defaultValue="city" name="precision">
            <option value="exact">Exact</option>
            <option value="city">City</option>
            <option value="region">Region</option>
            <option value="country">Country</option>
          </select>
        </label>
        <p className={styles.formHint}>
          Operator-approved operational context only. This is not live tracking.
        </p>
      </section>

      <ActionNotice state={state} />
      <div className={styles.formFooter}>
        <SubmitButton pendingLabel="Adding person…">
          Add to priority roster
        </SubmitButton>
      </div>
    </form>
  );
}

function ProfileForm({
  person,
  activeOperatorId,
  onSaved,
}: Required<Pick<PersonEditorProps, "person">> &
  Pick<PersonEditorProps, "activeOperatorId" | "onSaved">) {
  const [state, action] = useActionState(
    updatePersonAction,
    initialPeopleActionState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSaved(state.personId);
    }
  }, [onSaved, state.personId, state.status]);

  return (
    <form action={action} className={styles.editorForm}>
      <input name="actorOperatorId" type="hidden" value={activeOperatorId} />
      <input name="personId" type="hidden" value={person.id} />
      <section className={styles.formSection}>
        <span className={styles.formSectionLabel}>Profile and lifecycle</span>
        <label className={styles.fullField}>
          <span>Full name</span>
          <input
            defaultValue={person.displayName}
            name="displayName"
            required
          />
          <FieldError field="displayName" state={state} />
        </label>
        <div className={styles.fieldPair}>
          <label>
            <span>Title</span>
            <input defaultValue={person.title} name="title" />
          </label>
          <label>
            <span>Organization</span>
            <input defaultValue={person.organization} name="organization" />
          </label>
        </div>
        <div className={styles.fieldPair}>
          <label>
            <span>Protection tier</span>
            <select defaultValue={person.tier} name="tier">
              <option value="standard">Standard</option>
              <option value="high">High attention</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <label>
            <span>Roster status</span>
            <select defaultValue={person.status} name="status">
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>
        <label className={styles.fullField}>
          <span>Protection context</span>
          <textarea defaultValue={person.notes} name="notes" rows={5} />
          <FieldError field="notes" state={state} />
        </label>
        <p className={styles.formHint}>
          A person can be archived only after every active response case is
          closed or dismissed.
        </p>
      </section>
      <ActionNotice state={state} />
      <div className={styles.formFooter}>
        <SubmitButton pendingLabel="Saving profile…">Save profile</SubmitButton>
      </div>
    </form>
  );
}

function IdentityForm({
  person,
  activeOperatorId,
  onSaved,
}: Required<Pick<PersonEditorProps, "person">> &
  Pick<PersonEditorProps, "activeOperatorId" | "onSaved">) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(
    addPersonIdentityAction,
    initialPeopleActionState,
  );
  const [pendingIdentityId, setPendingIdentityId] = useState<string>();
  const [identityNotice, setIdentityNotice] = useState<PeopleActionState>();

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      onSaved(state.personId);
    }
  }, [onSaved, state.personId, state.status]);

  async function updateIdentity(
    identityId: string,
    mutation: (formData: FormData) => Promise<PeopleActionState>,
  ) {
    setPendingIdentityId(identityId);
    const formData = new FormData();
    formData.set("identityId", identityId);
    formData.set("actorOperatorId", activeOperatorId);
    const result = await mutation(formData);
    setIdentityNotice(result);
    setPendingIdentityId(undefined);
    if (result.status === "success") {
      onSaved(result.personId);
    }
  }

  return (
    <div className={styles.editorForm}>
      <section className={styles.formSection}>
        <span className={styles.formSectionLabel}>Approved identities</span>
        <p className={styles.sectionCopy}>
          Signal modules correlate findings against active identities. The
          primary identity is the roster default.
        </p>
        <ul className={styles.manageIdentityList}>
          {person.identities.map((identity) => (
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
                  <em>Primary</em>
                ) : null}
                {identity.isActive && !identity.isPrimary ? (
                  <>
                    <button
                      disabled={pendingIdentityId === identity.id}
                      onClick={() =>
                        void updateIdentity(
                          identity.id,
                          setPrimaryPersonIdentityAction,
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
                          deactivatePersonIdentityAction,
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
        <ActionNotice state={identityNotice} />
      </section>

      <form action={action} className={styles.formSection} ref={formRef}>
        <input name="actorOperatorId" type="hidden" value={activeOperatorId} />
        <input name="personId" type="hidden" value={person.id} />
        <span className={styles.formSectionLabel}>Add identity</span>
        <div className={styles.fieldPair}>
          <label>
            <span>Type</span>
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
            <span>Value</span>
            <input autoComplete="off" name="value" required />
            <FieldError field="value" state={state} />
          </label>
        </div>
        <label className={styles.checkField}>
          <input name="makePrimary" type="checkbox" />
          <span>Make this the primary identity</span>
        </label>
        <ActionNotice state={state} />
        <SubmitButton pendingLabel="Adding identity…">
          Add identity
        </SubmitButton>
      </form>
    </div>
  );
}

function LocationForm({
  person,
  activeOperatorId,
  onSaved,
}: Required<Pick<PersonEditorProps, "person">> &
  Pick<PersonEditorProps, "activeOperatorId" | "onSaved">) {
  const [state, action] = useActionState(
    replacePersonLocationAction,
    initialPeopleActionState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSaved(state.personId);
    }
  }, [onSaved, state.personId, state.status]);

  return (
    <form action={action} className={styles.editorForm}>
      <input name="actorOperatorId" type="hidden" value={activeOperatorId} />
      <input name="personId" type="hidden" value={person.id} />
      <section className={styles.formSection}>
        <span className={styles.formSectionLabel}>
          Replace current location
        </span>
        <p className={styles.sectionCopy}>
          {person.location
            ? `Current: ${person.location.label} (${person.location.precision} precision).`
            : "This person does not have a current approved location."}
        </p>
        <label className={styles.fullField}>
          <span>City, office, or region label</span>
          <input autoComplete="off" name="label" required />
          <FieldError field="label" state={state} />
        </label>
        <div className={styles.fieldPair}>
          <label>
            <span>Latitude</span>
            <input
              inputMode="decimal"
              max="90"
              min="-90"
              name="latitude"
              required
              step="any"
              type="number"
            />
            <FieldError field="latitude" state={state} />
          </label>
          <label>
            <span>Longitude</span>
            <input
              inputMode="decimal"
              max="180"
              min="-180"
              name="longitude"
              required
              step="any"
              type="number"
            />
            <FieldError field="longitude" state={state} />
          </label>
        </div>
        <label className={styles.fullField}>
          <span>Precision</span>
          <select defaultValue="city" name="precision">
            <option value="exact">Exact</option>
            <option value="city">City</option>
            <option value="region">Region</option>
            <option value="country">Country</option>
          </select>
        </label>
        <p className={styles.formHint}>
          The prior location is closed at the time of this change and retained
          in history for time-aware signal views.
        </p>
      </section>
      <ActionNotice state={state} />
      <div className={styles.formFooter}>
        <SubmitButton pendingLabel="Updating location…">
          Replace location
        </SubmitButton>
      </div>
    </form>
  );
}

export function PersonEditor({
  mode,
  person,
  activeOperatorId,
  onClose,
  onSaved,
}: PersonEditorProps) {
  const [section, setSection] = useState<"profile" | "identities" | "location">(
    "profile",
  );

  if (mode === "manage" && !person) {
    return null;
  }

  return (
    <aside
      aria-label={
        mode === "create" ? "Add person" : `Manage ${person!.displayName}`
      }
      className={styles.editor}
    >
      <header className={styles.editorHeader}>
        <span className={styles.eyebrow}>
          {mode === "create" ? "Priority roster" : "Person management"}
        </span>
        <button
          aria-label="Close person editor"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
        <h2>{mode === "create" ? "Add person" : person!.displayName}</h2>
        <p>
          {mode === "create"
            ? "Create the shared person record used across every signal module."
            : "Maintain profile, approved identities, and location history."}
        </p>
      </header>

      {mode === "manage" ? (
        <nav
          className={styles.editorTabs}
          aria-label="Person management sections"
        >
          {(["profile", "identities", "location"] as const).map((entry) => (
            <button
              aria-current={section === entry ? "page" : undefined}
              key={entry}
              onClick={() => setSection(entry)}
              type="button"
            >
              {titleCase(entry)}
            </button>
          ))}
        </nav>
      ) : null}

      {mode === "create" ? (
        <CreatePersonForm
          activeOperatorId={activeOperatorId}
          onSaved={onSaved}
        />
      ) : section === "profile" ? (
        <ProfileForm
          activeOperatorId={activeOperatorId}
          onSaved={onSaved}
          person={person!}
        />
      ) : section === "identities" ? (
        <IdentityForm
          activeOperatorId={activeOperatorId}
          onSaved={onSaved}
          person={person!}
        />
      ) : (
        <LocationForm
          activeOperatorId={activeOperatorId}
          onSaved={onSaved}
          person={person!}
        />
      )}
    </aside>
  );
}
