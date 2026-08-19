"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { PeopleActionState } from "@/features/people/action-state";
import {
  addPersonIdentityInputSchema,
  createPersonInputSchema,
  replacePersonLocationInputSchema,
  updatePersonInputSchema,
} from "@/features/people/domain";
import {
  addPersonIdentity,
  createPerson,
  deactivatePersonIdentity,
  PeopleWorkflowError,
  replacePersonLocation,
  setPrimaryPersonIdentity,
  updatePerson,
} from "@/features/people/server/workflows";

function textValue(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function revalidatePeopleConsumers() {
  revalidatePath("/home");
  revalidatePath("/home/globe");
  revalidatePath("/credsignal");
  revalidatePath("/worldsignal");
}

function actionError(error: unknown): PeopleActionState {
  if (error instanceof z.ZodError) {
    return {
      status: "error",
      message: "Some fields need attention before this can be saved.",
      fieldErrors: error.flatten().fieldErrors,
    };
  }
  if (error instanceof PeopleWorkflowError) {
    return { status: "error", message: error.message };
  }

  console.error("[People] A server action failed safely", {
    errorType: error instanceof Error ? error.name : typeof error,
  });
  return {
    status: "error",
    message:
      "People could not save the change. Check the database connection and try again.",
  };
}

export async function createPersonAction(
  _previousState: PeopleActionState,
  formData: FormData,
): Promise<PeopleActionState> {
  try {
    const input = createPersonInputSchema.parse({
      displayName: textValue(formData, "displayName"),
      title: textValue(formData, "title"),
      organization: textValue(formData, "organization"),
      tier: textValue(formData, "tier"),
      notes: textValue(formData, "notes"),
      identityType: textValue(formData, "identityType"),
      identityValue: textValue(formData, "identityValue"),
      locationLabel: textValue(formData, "locationLabel"),
      latitude: textValue(formData, "latitude"),
      longitude: textValue(formData, "longitude"),
      precision: textValue(formData, "precision"),
    });
    const result = await createPerson(
      input,
      textValue(formData, "actorOperatorId") || undefined,
    );
    revalidatePeopleConsumers();
    return {
      status: "success",
      message: `${input.displayName} is now on the priority roster.`,
      createdId: result.personId,
      personId: result.personId,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function updatePersonAction(
  _previousState: PeopleActionState,
  formData: FormData,
): Promise<PeopleActionState> {
  try {
    const input = updatePersonInputSchema.parse({
      personId: textValue(formData, "personId"),
      displayName: textValue(formData, "displayName"),
      title: textValue(formData, "title"),
      organization: textValue(formData, "organization"),
      tier: textValue(formData, "tier"),
      status: textValue(formData, "status"),
      notes: textValue(formData, "notes"),
    });
    const result = await updatePerson(
      input,
      textValue(formData, "actorOperatorId") || undefined,
    );
    revalidatePeopleConsumers();
    return {
      status: "success",
      message: "Person profile updated.",
      personId: result.personId,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function addPersonIdentityAction(
  _previousState: PeopleActionState,
  formData: FormData,
): Promise<PeopleActionState> {
  try {
    const input = addPersonIdentityInputSchema.parse({
      personId: textValue(formData, "personId"),
      type: textValue(formData, "type"),
      value: textValue(formData, "value"),
      makePrimary: textValue(formData, "makePrimary") === "on",
    });
    const result = await addPersonIdentity(
      input,
      textValue(formData, "actorOperatorId") || undefined,
    );
    revalidatePeopleConsumers();
    return {
      status: "success",
      message: "Approved identity added.",
      personId: result.personId,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function setPrimaryPersonIdentityAction(
  formData: FormData,
): Promise<PeopleActionState> {
  try {
    const result = await setPrimaryPersonIdentity(
      textValue(formData, "identityId"),
      textValue(formData, "actorOperatorId") || undefined,
    );
    revalidatePeopleConsumers();
    return {
      status: "success",
      message: "Primary identity updated.",
      personId: result.personId,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function deactivatePersonIdentityAction(
  formData: FormData,
): Promise<PeopleActionState> {
  try {
    const result = await deactivatePersonIdentity(
      textValue(formData, "identityId"),
      textValue(formData, "actorOperatorId") || undefined,
    );
    revalidatePeopleConsumers();
    return {
      status: "success",
      message: "Identity deactivated and retained in history.",
      personId: result.personId,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function replacePersonLocationAction(
  _previousState: PeopleActionState,
  formData: FormData,
): Promise<PeopleActionState> {
  try {
    const input = replacePersonLocationInputSchema.parse({
      personId: textValue(formData, "personId"),
      label: textValue(formData, "label"),
      latitude: textValue(formData, "latitude"),
      longitude: textValue(formData, "longitude"),
      precision: textValue(formData, "precision"),
    });
    const result = await replacePersonLocation(
      input,
      textValue(formData, "actorOperatorId") || undefined,
    );
    revalidatePeopleConsumers();
    return {
      status: "success",
      message: "Operational location replaced; prior location retained.",
      personId: result.personId,
    };
  } catch (error) {
    return actionError(error);
  }
}
