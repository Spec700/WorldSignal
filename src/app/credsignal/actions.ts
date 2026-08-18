"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  addProtecteeIdentityInputSchema,
  communicationStatuses,
  createCaseCommunicationInputSchema,
  createCaseTaskInputSchema,
  createExposureInputSchema,
  createProtecteeInputSchema,
  matchExposureInputSchema,
  replaceProtecteeLocationInputSchema,
  updateCaseCoordinationInputSchema,
  updateCaseTaskInputSchema,
  updateProtecteeInputSchema,
} from "@/features/credsignal/domain";
import type { CredSignalActionState } from "@/features/credsignal/action-state";
import {
  addProtecteeIdentity,
  createCaseCommunication,
  createCaseTask,
  createExposure,
  createProtectee,
  CredSignalWorkflowError,
  deactivateProtecteeIdentity,
  manuallyMatchExposure,
  replaceProtecteeLocation,
  revealCredential,
  setPrimaryProtecteeIdentity,
  transitionCase,
  transitionCaseCommunication,
  transitionTask,
  updateCaseCoordination,
  updateCaseTask,
  updateProtectee,
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

export async function createProtecteeAction(
  _previousState: CredSignalActionState,
  formData: FormData,
): Promise<CredSignalActionState> {
  try {
    const input = createProtecteeInputSchema.parse({
      displayName: textValue(formData, "displayName"),
      title: textValue(formData, "title"),
      organization: textValue(formData, "organization"),
      tier: textValue(formData, "tier"),
      identityType: textValue(formData, "identityType"),
      identityValue: textValue(formData, "identityValue"),
      locationLabel: textValue(formData, "locationLabel"),
      latitude: textValue(formData, "latitude"),
      longitude: textValue(formData, "longitude"),
    });
    const result = await createProtectee(
      input,
      textValue(formData, "actorOperatorId") || undefined,
    );
    revalidatePath("/credsignal");
    return {
      status: "success",
      message: `${input.displayName} is now monitored by CredSignal.`,
      createdId: result.protecteeId,
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

export async function updateProtecteeAction(
  _previousState: CredSignalActionState,
  formData: FormData,
): Promise<CredSignalActionState> {
  try {
    const input = updateProtecteeInputSchema.parse({
      protecteeId: textValue(formData, "protecteeId"),
      displayName: textValue(formData, "displayName"),
      title: textValue(formData, "title"),
      organization: textValue(formData, "organization"),
      tier: textValue(formData, "tier"),
      status: textValue(formData, "status"),
    });
    const result = await updateProtectee(
      input,
      textValue(formData, "actorOperatorId") || undefined,
    );
    revalidatePath("/credsignal");
    return {
      status: "success",
      message: "Protectee profile updated.",
      protecteeId: result.protecteeId,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function addProtecteeIdentityAction(
  _previousState: CredSignalActionState,
  formData: FormData,
): Promise<CredSignalActionState> {
  try {
    const input = addProtecteeIdentityInputSchema.parse({
      protecteeId: textValue(formData, "protecteeId"),
      type: textValue(formData, "type"),
      value: textValue(formData, "value"),
      makePrimary: textValue(formData, "makePrimary") === "on",
    });
    const result = await addProtecteeIdentity(
      input,
      textValue(formData, "actorOperatorId") || undefined,
    );
    revalidatePath("/credsignal");
    return {
      status: "success",
      message: "Approved identity added to monitoring.",
      protecteeId: result.protecteeId,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function setPrimaryProtecteeIdentityAction(
  formData: FormData,
): Promise<CredSignalActionState> {
  try {
    const result = await setPrimaryProtecteeIdentity(
      textValue(formData, "identityId"),
      textValue(formData, "actorOperatorId") || undefined,
    );
    revalidatePath("/credsignal");
    return {
      status: "success",
      message: "Primary identity updated.",
      protecteeId: result.protecteeId,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function deactivateProtecteeIdentityAction(
  formData: FormData,
): Promise<CredSignalActionState> {
  try {
    const result = await deactivateProtecteeIdentity(
      textValue(formData, "identityId"),
      textValue(formData, "actorOperatorId") || undefined,
    );
    revalidatePath("/credsignal");
    return {
      status: "success",
      message: "Identity deactivated and retained in history.",
      protecteeId: result.protecteeId,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function replaceProtecteeLocationAction(
  _previousState: CredSignalActionState,
  formData: FormData,
): Promise<CredSignalActionState> {
  try {
    const input = replaceProtecteeLocationInputSchema.parse({
      protecteeId: textValue(formData, "protecteeId"),
      label: textValue(formData, "label"),
      latitude: textValue(formData, "latitude"),
      longitude: textValue(formData, "longitude"),
      precision: textValue(formData, "precision"),
    });
    const result = await replaceProtecteeLocation(
      input,
      textValue(formData, "actorOperatorId") || undefined,
    );
    revalidatePath("/credsignal");
    return {
      status: "success",
      message: "Operational location replaced; prior location retained.",
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
