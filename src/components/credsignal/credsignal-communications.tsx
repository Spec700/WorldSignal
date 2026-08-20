"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  createCaseCommunicationAction,
  transitionCaseCommunicationAction,
} from "@/app/credsignal/actions";
import {
  initialCredSignalActionState,
  type CredSignalActionState,
} from "@/features/credsignal/action-state";
import type {
  CredSignalCaseDto,
  CredSignalCommunicationDto,
} from "@/features/credsignal/types";
import { LocalTimestamp } from "@/components/local-timestamp";

import styles from "@/app/credsignal/credsignal.module.css";

interface CredSignalCommunicationsProps {
  activeOperatorId: string;
  responseCase: CredSignalCaseDto;
}

const communicationActions: Record<
  CredSignalCommunicationDto["status"],
  { label: string; status: CredSignalCommunicationDto["status"] }[]
> = {
  draft: [
    { label: "Plan contact", status: "planned" },
    { label: "Record sent", status: "sent" },
  ],
  planned: [
    { label: "Record sent", status: "sent" },
    { label: "Mark failed", status: "failed" },
    { label: "Return to draft", status: "draft" },
  ],
  sent: [
    { label: "Record acknowledged", status: "acknowledged" },
    { label: "Mark failed", status: "failed" },
  ],
  acknowledged: [],
  failed: [
    { label: "Replan contact", status: "planned" },
    { label: "Record sent", status: "sent" },
  ],
};

function titleCase(value: string) {
  return value
    .split("_")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function FieldError({
  field,
  state,
}: {
  field: string;
  state: CredSignalActionState;
}) {
  const message = state.fieldErrors?.[field]?.[0];
  return message ? <span className={styles.fieldError}>{message}</span> : null;
}

function SaveCommunicationButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className={styles.communicationSubmit}
      disabled={pending}
      type="submit"
    >
      {pending ? "Saving record…" : "Save coordination record"}
    </button>
  );
}

export function CredSignalCommunications({
  activeOperatorId,
  responseCase,
}: CredSignalCommunicationsProps) {
  const [createState, createAction] = useActionState(
    createCaseCommunicationAction,
    initialCredSignalActionState,
  );
  const [transitionState, setTransitionState] = useState<CredSignalActionState>(
    initialCredSignalActionState,
  );
  const [pendingId, setPendingId] = useState<string>();
  const createPanelRef = useRef<HTMLDetailsElement>(null);
  const terminalCase =
    responseCase.status === "closed" || responseCase.status === "dismissed";

  useEffect(() => {
    if (createState.status === "success" && createPanelRef.current) {
      createPanelRef.current.open = false;
    }
  }, [createState.createdId, createState.status]);

  async function transition(
    communicationId: string,
    status: CredSignalCommunicationDto["status"],
  ) {
    setPendingId(communicationId);
    const formData = new FormData();
    formData.set("communicationId", communicationId);
    formData.set("status", status);
    formData.set("actorOperatorId", activeOperatorId);
    const result = await transitionCaseCommunicationAction(formData);
    setTransitionState(result);
    setPendingId(undefined);
  }

  return (
    <section
      aria-labelledby={`communication-heading-${responseCase.id}`}
      className={styles.communicationBlock}
    >
      <header className={styles.communicationHeading}>
        <div>
          <h4 id={`communication-heading-${responseCase.id}`}>
            Victim coordination
          </h4>
          <small>
            Manual record · {responseCase.communications.length} logged
          </small>
        </div>
        <span>Operator tracked</span>
      </header>

      {transitionState.status !== "idle" && transitionState.message ? (
        <div
          className={styles.communicationNotice}
          data-status={transitionState.status}
          role={transitionState.status === "error" ? "alert" : "status"}
        >
          {transitionState.message}
        </div>
      ) : null}

      {responseCase.communications.length > 0 ? (
        <div className={styles.communicationLedger}>
          {responseCase.communications.map((communication) => (
            <article key={communication.id}>
              <header>
                <span data-status={communication.status}>
                  {titleCase(communication.status)}
                </span>
                <strong>{communication.recipientLabel}</strong>
                <small>{titleCase(communication.channel)}</small>
              </header>
              {communication.subject ? (
                <p className={styles.communicationSubject}>
                  {communication.subject}
                </p>
              ) : null}
              {communication.body ? (
                <details className={styles.communicationNotes}>
                  <summary>View coordination notes</summary>
                  <p>{communication.body}</p>
                </details>
              ) : null}
              <dl className={styles.communicationTimes}>
                <div>
                  <dt>Logged</dt>
                  <dd>
                    <LocalTimestamp timestamp={communication.createdAt} />
                  </dd>
                </div>
                {communication.sentAt ? (
                  <div>
                    <dt>Sent</dt>
                    <dd>
                      <LocalTimestamp timestamp={communication.sentAt} />
                    </dd>
                  </div>
                ) : null}
                {communication.acknowledgedAt ? (
                  <div>
                    <dt>Acknowledged</dt>
                    <dd>
                      <LocalTimestamp
                        timestamp={communication.acknowledgedAt}
                      />
                    </dd>
                  </div>
                ) : null}
              </dl>
              {communicationActions[communication.status].length > 0 ? (
                <div
                  aria-label={`Update communication for ${communication.recipientLabel}`}
                  className={styles.communicationActions}
                >
                  {communicationActions[communication.status].map((action) => (
                    <button
                      disabled={pendingId === communication.id}
                      key={action.status}
                      onClick={() =>
                        void transition(communication.id, action.status)
                      }
                      type="button"
                    >
                      {pendingId === communication.id
                        ? "Recording…"
                        : action.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className={styles.communicationEmpty}>
          No victim contact has been logged for this case.
        </p>
      )}

      {terminalCase ? (
        <p className={styles.communicationClosedNotice}>
          Reopen this case to add another coordination record.
        </p>
      ) : (
        <details className={styles.communicationCreate} ref={createPanelRef}>
          <summary>Add coordination record</summary>
          <form action={createAction}>
            <input name="caseId" type="hidden" value={responseCase.id} />
            <input
              name="actorOperatorId"
              type="hidden"
              value={activeOperatorId}
            />
            <div className={styles.fieldPair}>
              <label>
                <span>Channel</span>
                <select defaultValue="email" name="channel">
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="chat">Secure chat</option>
                  <option value="in_person">In person</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>
                <span>Initial state</span>
                <select defaultValue="draft" name="status">
                  <option value="draft">Draft</option>
                  <option value="planned">Planned</option>
                </select>
              </label>
            </div>
            <label>
              <span>Recipient</span>
              <input
                autoComplete="off"
                name="recipientLabel"
                placeholder="Protectee or approved contact"
                required
              />
              <FieldError field="recipientLabel" state={createState} />
            </label>
            <label>
              <span>Subject or purpose</span>
              <input
                autoComplete="off"
                name="subject"
                placeholder="Credential response coordination"
              />
              <FieldError field="subject" state={createState} />
            </label>
            <label>
              <span>Operator notes</span>
              <textarea
                name="body"
                placeholder="Record the planned or completed contact."
                rows={3}
              />
              <FieldError field="body" state={createState} />
            </label>
            <p className={styles.communicationFormHint}>
              Priority Signals records coordination only; it does not send this
              message.
            </p>
            {createState.status !== "idle" && createState.message ? (
              <div
                className={styles.communicationNotice}
                data-status={createState.status}
                role={createState.status === "error" ? "alert" : "status"}
              >
                {createState.message}
              </div>
            ) : null}
            <SaveCommunicationButton />
          </form>
        </details>
      )}
    </section>
  );
}
