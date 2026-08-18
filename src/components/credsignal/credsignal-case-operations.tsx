"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  createCaseTaskAction,
  transitionTaskAction,
  updateCaseCoordinationAction,
  updateCaseTaskAction,
} from "@/app/credsignal/actions";
import {
  initialCredSignalActionState,
  type CredSignalActionState,
} from "@/features/credsignal/action-state";
import type {
  CredSignalCaseDto,
  CredSignalOperatorDto,
  CredSignalTaskDto,
} from "@/features/credsignal/types";
import { formatLocalTimestamp } from "@/lib/time/format";

import styles from "@/app/credsignal/credsignal.module.css";

interface CredSignalCaseOperationsProps {
  activeOperatorId: string;
  operators: CredSignalOperatorDto[];
  responseCase: CredSignalCaseDto;
}

const taskActions: Record<
  CredSignalTaskDto["status"],
  { label: string; status: CredSignalTaskDto["status"] }[]
> = {
  todo: [
    { label: "Start", status: "in_progress" },
    { label: "Complete", status: "completed" },
    { label: "Cancel", status: "cancelled" },
  ],
  in_progress: [
    { label: "Complete", status: "completed" },
    { label: "Return to todo", status: "todo" },
    { label: "Cancel", status: "cancelled" },
  ],
  completed: [{ label: "Reopen", status: "in_progress" }],
  cancelled: [{ label: "Reactivate", status: "todo" }],
};

function localDateTimeInput(isoTimestamp?: string) {
  if (!isoTimestamp) {
    return "";
  }
  const date = new Date(isoTimestamp);
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

function MutationNotice({ state }: { state: CredSignalActionState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  return (
    <div
      className={styles.caseOperationNotice}
      data-status={state.status}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </div>
  );
}

function FormSubmit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button
      className={styles.caseOperationSubmit}
      disabled={pending}
      type="submit"
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

function OperatorOptions({
  operators,
}: {
  operators: CredSignalOperatorDto[];
}) {
  return (
    <>
      <option value="">Unassigned</option>
      {operators.map((operator) => (
        <option key={operator.id} value={operator.id}>
          {operator.displayName}
        </option>
      ))}
    </>
  );
}

function CaseCoordinationForm({
  activeOperatorId,
  operators,
  responseCase,
}: CredSignalCaseOperationsProps) {
  const [state, action] = useActionState(
    updateCaseCoordinationAction,
    initialCredSignalActionState,
  );
  const formKey = `${responseCase.assigneeId ?? "unassigned"}-${responseCase.priority}-${responseCase.dueAt ?? "undated"}`;

  return (
    <details className={styles.caseCoordinationEdit}>
      <summary>Edit case accountability</summary>
      <form
        action={action}
        key={formKey}
        onReset={(event) => event.preventDefault()}
      >
        <input name="caseId" type="hidden" value={responseCase.id} />
        <input name="actorOperatorId" type="hidden" value={activeOperatorId} />
        <label>
          <span>Case owner</span>
          <select
            defaultValue={responseCase.assigneeId ?? ""}
            name="assigneeOperatorId"
          >
            <OperatorOptions operators={operators} />
          </select>
        </label>
        <div className={styles.fieldPair}>
          <label>
            <span>Priority</span>
            <select defaultValue={responseCase.priority} name="priority">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <label>
            <span>Case due</span>
            <input
              defaultValue={localDateTimeInput(responseCase.dueAt)}
              name="dueAt"
              required
              type="datetime-local"
            />
            <FieldError field="dueAt" state={state} />
          </label>
        </div>
        <MutationNotice state={state} />
        <FormSubmit>Update accountability</FormSubmit>
      </form>
    </details>
  );
}

function TaskCoordinationForm({
  activeOperatorId,
  operators,
  task,
}: {
  activeOperatorId: string;
  operators: CredSignalOperatorDto[];
  task: CredSignalTaskDto;
}) {
  const [state, action] = useActionState(
    updateCaseTaskAction,
    initialCredSignalActionState,
  );
  const formKey = `${task.assigneeId ?? "unassigned"}-${task.dueAt ?? "undated"}-${task.notes ?? "no-notes"}`;

  return (
    <details className={styles.taskEdit}>
      <summary>Edit details</summary>
      <form
        action={action}
        key={formKey}
        onReset={(event) => event.preventDefault()}
      >
        <input name="taskId" type="hidden" value={task.id} />
        <input name="actorOperatorId" type="hidden" value={activeOperatorId} />
        <label>
          <span>Task owner</span>
          <select
            defaultValue={task.assigneeId ?? ""}
            name="assigneeOperatorId"
          >
            <OperatorOptions operators={operators} />
          </select>
        </label>
        <label>
          <span>Task due</span>
          <input
            defaultValue={localDateTimeInput(task.dueAt)}
            name="dueAt"
            type="datetime-local"
          />
          <FieldError field="dueAt" state={state} />
        </label>
        <label>
          <span>Operator notes</span>
          <textarea defaultValue={task.notes ?? ""} name="notes" rows={3} />
          <FieldError field="notes" state={state} />
        </label>
        <MutationNotice state={state} />
        <FormSubmit>Update task details</FormSubmit>
      </form>
    </details>
  );
}

function AddTaskForm({
  activeOperatorId,
  operators,
  responseCase,
}: CredSignalCaseOperationsProps) {
  const [state, action] = useActionState(
    createCaseTaskAction,
    initialCredSignalActionState,
  );
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (state.status === "success" && detailsRef.current) {
      detailsRef.current.open = false;
    }
  }, [state.createdId, state.status]);

  return (
    <details className={styles.addTask} ref={detailsRef}>
      <summary>Add response task</summary>
      <form action={action}>
        <input name="caseId" type="hidden" value={responseCase.id} />
        <input name="actorOperatorId" type="hidden" value={activeOperatorId} />
        <div className={styles.fieldPair}>
          <label>
            <span>Task type</span>
            <select defaultValue="verify" name="type">
              <option value="verify">Verify exposure</option>
              <option value="notify">Notify protectee</option>
              <option value="password_reset">Password reset</option>
              <option value="revoke_sessions">Revoke sessions</option>
              <option value="enable_mfa">Enable MFA</option>
              <option value="check_reuse">Check credential reuse</option>
              <option value="investigate_device">Investigate device</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            <span>Task owner</span>
            <select
              defaultValue={responseCase.assigneeId ?? activeOperatorId}
              name="assigneeOperatorId"
            >
              <OperatorOptions operators={operators} />
            </select>
          </label>
        </div>
        <label>
          <span>Task title</span>
          <input autoComplete="off" name="title" required />
          <FieldError field="title" state={state} />
        </label>
        <label>
          <span>Task due</span>
          <input
            defaultValue={localDateTimeInput(responseCase.dueAt)}
            name="dueAt"
            type="datetime-local"
          />
          <FieldError field="dueAt" state={state} />
        </label>
        <label>
          <span>Operator notes</span>
          <textarea name="notes" rows={3} />
          <FieldError field="notes" state={state} />
        </label>
        <MutationNotice state={state} />
        <FormSubmit>Add task</FormSubmit>
      </form>
    </details>
  );
}

export function CredSignalCaseOperations({
  activeOperatorId,
  operators,
  responseCase,
}: CredSignalCaseOperationsProps) {
  const [pendingId, setPendingId] = useState<string>();
  const [transitionState, setTransitionState] = useState<CredSignalActionState>(
    initialCredSignalActionState,
  );
  const terminalCase =
    responseCase.status === "closed" || responseCase.status === "dismissed";
  const terminalTaskCount = responseCase.tasks.filter(
    (task) => task.status === "completed" || task.status === "cancelled",
  ).length;

  async function transition(
    taskId: string,
    status: CredSignalTaskDto["status"],
  ) {
    setPendingId(taskId);
    const formData = new FormData();
    formData.set("taskId", taskId);
    formData.set("status", status);
    formData.set("actorOperatorId", activeOperatorId);
    const result = await transitionTaskAction(formData);
    setTransitionState(result);
    setPendingId(undefined);
  }

  return (
    <section
      aria-labelledby={`task-heading-${responseCase.id}`}
      className={styles.caseOperations}
    >
      {terminalCase ? null : (
        <CaseCoordinationForm
          activeOperatorId={activeOperatorId}
          operators={operators}
          responseCase={responseCase}
        />
      )}

      <header className={styles.taskHeading}>
        <h4 id={`task-heading-${responseCase.id}`}>Response checklist</h4>
        <span>
          {terminalTaskCount}/{responseCase.tasks.length} terminal
        </span>
      </header>
      <MutationNotice state={transitionState} />

      <div className={styles.taskList}>
        {responseCase.tasks.map((task) => (
          <div data-status={task.status} key={task.id}>
            <span aria-hidden="true">
              {task.status === "completed"
                ? "✓"
                : task.status === "cancelled"
                  ? "×"
                  : task.status === "in_progress"
                    ? "◉"
                    : "○"}
            </span>
            <p>
              <strong>{task.title}</strong>
              <small>
                {task.assigneeName ?? "Unassigned"} ·{" "}
                {task.status.replaceAll("_", " ")}
              </small>
              <small>
                {task.dueAt
                  ? `Due ${formatLocalTimestamp(task.dueAt)}`
                  : "No task due date"}
              </small>
            </p>
            {terminalCase ? null : (
              <div className={styles.taskActionGroup}>
                {taskActions[task.status].map((taskAction) => (
                  <button
                    aria-label={`${taskAction.label}: ${task.title}`}
                    disabled={pendingId === task.id}
                    key={taskAction.status}
                    onClick={() => void transition(task.id, taskAction.status)}
                    type="button"
                  >
                    {pendingId === task.id ? "Saving…" : taskAction.label}
                  </button>
                ))}
              </div>
            )}
            {terminalCase ? null : (
              <TaskCoordinationForm
                activeOperatorId={activeOperatorId}
                operators={operators}
                task={task}
              />
            )}
          </div>
        ))}
      </div>

      {terminalCase ? (
        <p className={styles.caseOperationsClosed}>
          Reopen this case to change tasks or accountability.
        </p>
      ) : (
        <AddTaskForm
          activeOperatorId={activeOperatorId}
          operators={operators}
          responseCase={responseCase}
        />
      )}
    </section>
  );
}
