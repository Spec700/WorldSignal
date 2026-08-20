"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  communicationStatuses,
  changeCredentialStatusInputSchema,
  createCaseCommunicationInputSchema,
  createCaseTaskInputSchema,
  createCredentialInputSchema,
  createExposureInputSchema,
  matchExposureInputSchema,
  rotateCredentialInputSchema,
  updateCaseCoordinationInputSchema,
  updateCaseTaskInputSchema,
} from "@/features/credsignal/domain";
import type { CredSignalActionState } from "@/features/credsignal/action-state";
import {
  changeCredentialStatus,
  createCaseCommunication,
  createCaseTask,
  createCredential,
  createExposure,
  CredSignalWorkflowError,
  manuallyMatchExposure,
  revealManagedCredential,
  revealCredential,
  rotateCredential,
  transitionCase,
  transitionCaseCommunication,
  transitionTask,
  updateCaseCoordination,
  updateCaseTask,
} from "@/features/credsignal/server/workflows";

function textValue(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function actionError(error: unknown): CredSignalActionState {
  if (error instanceof z.ZodError) {
    return {
      status: "error",
      message: "Some fields need attention before this can be saved.",
      fieldErrors: error.flatten().fieldErrors,
    };
  }
  if (error instanceof CredSignalWorkflowError) {
    return { status: "error", message: error.message };
  }

  console.error("[CredSignal] A server action failed safely", {
    errorType: error instanceof Error ? error.name : typeof error,
  });
  return {
    status: "error",
    message:
      "CredSignal could not save the change. Check the database connection and try again.",
  };
}

function revalidateCredSignal() {
  revalidatePath("/credsignal");
  revalidatePath("/credsignal/globe");
}

export async function createManagedCredentialAction(
  _previousState: CredSignalActionState,
  formData: FormData,
): Promise<CredSignalActionState> {
  try {
    const input = createCredentialInputSchema.parse({
      protecteeId: textValue(formData, "protecteeId"),
      identityId: textValue(formData, "identityId"),
      accountIdentifier: textValue(formData, "accountIdentifier"),
      service: textValue(formData, "service"),
      serviceDomain: textValue(formData, "serviceDomain"),
      credentialKind: textValue(formData, "credentialKind"),
      credentialValue: textValue(formData, "credentialValue"),
      notes: textValue(formData, "notes"),
    });
    const result = await createCredential(
      input,
      textValue(formData, "actorOperatorId") || undefined,
    );
    revalidateCredSignal();
    return {
      status: "success",
      message: "Managed credential added to the inventory.",
      createdId: result.credentialId,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function rotateManagedCredentialAction(
  _previousState: CredSignalActionState,
  formData: FormData,
): Promise<CredSignalActionState> {
  try {
    const input = rotateCredentialInputSchema.parse({
      credentialId: textValue(formData, "credentialId"),
      credentialValue: textValue(formData, "credentialValue"),
      notes: textValue(formData, "notes"),
    });
    const result = await rotateCredential(
      input,
      textValue(formData, "actorOperatorId") || undefined,
    );
    revalidateCredSignal();
    return {
      status: "success",
      message: "Credential rotated and the previous version retired.",
      createdId: result.credentialId,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function changeManagedCredentialStatusAction(
  _previousState: CredSignalActionState,
  formData: FormData,
): Promise<CredSignalActionState> {
  try {
    const input = changeCredentialStatusInputSchema.parse({
      credentialId: textValue(formData, "credentialId"),
      status: textValue(formData, "status"),
      reason: textValue(formData, "reason"),
    });
    const result = await changeCredentialStatus(
      input,
      textValue(formData, "actorOperatorId") || undefined,
    );
    revalidateCredSignal();
    return {
      status: "success",
      message: `Credential marked ${input.status}.`,
      createdId: result.credentialId,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function createExposureAction(
  _previousState: CredSignalActionState,
  formData: FormData,
): Promise<CredSignalActionState> {
  try {
    const input = createExposureInputSchema.parse({
      protecteeId: textValue(formData, "protecteeId"),
      identityType: textValue(formData, "identityType"),
      identityValue: textValue(formData, "identityValue"),
      credentialKind: textValue(formData, "credentialKind"),
      credentialValue: textValue(formData, "credentialValue"),
      service: textValue(formData, "service"),
      serviceDomain: textValue(formData, "serviceDomain"),
      sourceType: textValue(formData, "sourceType"),
      sourceName: textValue(formData, "sourceName"),
      sourceRecordId: textValue(formData, "sourceRecordId"),
      observedAt: textValue(formData, "observedAt"),
      severity: textValue(formData, "severity") || undefined,
      confidence: textValue(formData, "confidence"),
      notes: textValue(formData, "notes"),
    });
    const result = await createExposure(
      input,
      textValue(formData, "actorOperatorId") || undefined,
    );
    revalidatePath("/credsignal");
    return {
      status: "success",
      message: result.caseId
        ? "Exposure recorded, matched, and opened as a response case."
        : "Exposure recorded in the unmatched triage queue.",
      createdId: result.exposureId,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function matchExposureAction(
  _previousState: CredSignalActionState,
  formData: FormData,
): Promise<CredSignalActionState> {
  try {
    const input = matchExposureInputSchema.parse({
      exposureId: textValue(formData, "exposureId"),
      protecteeId: textValue(formData, "protecteeId"),
      identityId: textValue(formData, "identityId"),
      credentialId: textValue(formData, "credentialId"),
      reason: textValue(formData, "reason"),
    });
    const result = await manuallyMatchExposure(
      input,
      textValue(formData, "actorOperatorId") || undefined,
    );
    revalidatePath("/credsignal");
    return {
      status: "success",
      message: "Exposure assigned and response case opened.",
      createdId: result.caseId,
      protecteeId: result.protecteeId,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function transitionTaskAction(
  formData: FormData,
): Promise<CredSignalActionState> {
  try {
    await transitionTask(
      textValue(formData, "taskId"),
      z
        .enum(["todo", "in_progress", "completed", "cancelled"])
        .parse(textValue(formData, "status")),
      textValue(formData, "actorOperatorId") || undefined,
    );
    revalidatePath("/credsignal");
    return { status: "success", message: "Task status updated." };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateCaseCoordinationAction(
  _previousState: CredSignalActionState,
  formData: FormData,
): Promise<CredSignalActionState> {
  try {
    const input = updateCaseCoordinationInputSchema.parse({
      caseId: textValue(formData, "caseId"),
      assigneeOperatorId: textValue(formData, "assigneeOperatorId"),
      priority: textValue(formData, "priority"),
      dueAt: textValue(formData, "dueAt"),
    });
    const result = await updateCaseCoordination(
      input,
      textValue(formData, "actorOperatorId") || undefined,
    );
    revalidatePath("/credsignal");
    return {
      status: "success",
      message: "Case owner and response targets updated.",
      createdId: result.caseId,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function createCaseTaskAction(
  _previousState: CredSignalActionState,
  formData: FormData,
): Promise<CredSignalActionState> {
  try {
    const input = createCaseTaskInputSchema.parse({
      caseId: textValue(formData, "caseId"),
      type: textValue(formData, "type"),
      title: textValue(formData, "title"),
      assigneeOperatorId: textValue(formData, "assigneeOperatorId"),
      dueAt: textValue(formData, "dueAt"),
      notes: textValue(formData, "notes"),
    });
    const result = await createCaseTask(
      input,
      textValue(formData, "actorOperatorId") || undefined,
    );
    revalidatePath("/credsignal");
    return {
      status: "success",
      message: "Response task added to the case.",
      createdId: result.taskId,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateCaseTaskAction(
  _previousState: CredSignalActionState,
  formData: FormData,
): Promise<CredSignalActionState> {
  try {
    const input = updateCaseTaskInputSchema.parse({
      taskId: textValue(formData, "taskId"),
      assigneeOperatorId: textValue(formData, "assigneeOperatorId"),
      dueAt: textValue(formData, "dueAt"),
      notes: textValue(formData, "notes"),
    });
    const result = await updateCaseTask(
      input,
      textValue(formData, "actorOperatorId") || undefined,
    );
    revalidatePath("/credsignal");
    return {
      status: "success",
      message: "Task ownership and response target updated.",
      createdId: result.taskId,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function createCaseCommunicationAction(
  _previousState: CredSignalActionState,
  formData: FormData,
): Promise<CredSignalActionState> {
  try {
    const input = createCaseCommunicationInputSchema.parse({
      caseId: textValue(formData, "caseId"),
      channel: textValue(formData, "channel"),
      recipientLabel: textValue(formData, "recipientLabel"),
      subject: textValue(formData, "subject"),
      body: textValue(formData, "body"),
      status: textValue(formData, "status"),
    });
    const result = await createCaseCommunication(
      input,
      textValue(formData, "actorOperatorId") || undefined,
    );
    revalidatePath("/credsignal");
    return {
      status: "success",
      message: `Communication record saved as ${input.status}.`,
      createdId: result.communicationId,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function transitionCaseCommunicationAction(
  formData: FormData,
): Promise<CredSignalActionState> {
  try {
    const status = z
      .enum(communicationStatuses)
      .parse(textValue(formData, "status"));
    await transitionCaseCommunication(
      textValue(formData, "communicationId"),
      status,
      textValue(formData, "actorOperatorId") || undefined,
    );
    revalidatePath("/credsignal");
    return {
      status: "success",
      message: `Communication recorded as ${status}.`,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function transitionCaseAction(
  formData: FormData,
): Promise<CredSignalActionState> {
  try {
    await transitionCase(
      textValue(formData, "caseId"),
      z
        .enum([
          "open",
          "investigating",
          "notifying",
          "remediating",
          "monitoring",
          "closed",
          "dismissed",
        ])
        .parse(textValue(formData, "status")),
      textValue(formData, "resolution") || undefined,
      textValue(formData, "actorOperatorId") || undefined,
    );
    revalidatePath("/credsignal");
    return { status: "success", message: "Case status updated." };
  } catch (error) {
    return actionError(error);
  }
}

export async function revealCredentialAction(
  exposureId: string,
  actorOperatorId?: string,
): Promise<CredSignalActionState & { value?: string }> {
  try {
    const value = await revealCredential(exposureId, actorOperatorId);
    revalidatePath("/credsignal");
    return {
      status: "success",
      message: "Credential revealed. This action was recorded.",
      value,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function revealManagedCredentialAction(
  credentialId: string,
  actorOperatorId?: string,
): Promise<CredSignalActionState & { value?: string }> {
  try {
    const value = await revealManagedCredential(credentialId, actorOperatorId);
    revalidateCredSignal();
    return {
      status: "success",
      message: "Managed credential revealed. This action was recorded.",
      value,
    };
  } catch (error) {
    return actionError(error);
  }
}
