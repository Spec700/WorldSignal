"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  createExposureInputSchema,
  createProtecteeInputSchema,
  matchExposureInputSchema,
} from "@/features/credsignal/domain";
import type { CredSignalActionState } from "@/features/credsignal/action-state";
import {
  createExposure,
  createProtectee,
  CredSignalWorkflowError,
  manuallyMatchExposure,
  revealCredential,
  transitionCase,
  transitionTask,
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
