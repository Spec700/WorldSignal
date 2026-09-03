"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type {
  FlightRouteLookupState,
  FlightSignalActionState,
} from "@/features/flights/action-state";
import {
  createFlightTrackingInputSchema,
  parseFlightDesignator,
} from "@/features/flights/domain";
import {
  fetchAirLabsFlightForWorkspace,
  AirLabsRequestDeniedError,
} from "@/features/flights/server/airlabs-source";
import { sealFlightLookup } from "@/features/flights/server/confirmation-token";
import {
  cancelFlightAssignment,
  completeTravelerFlight,
  confirmTravelerOnboard,
  createTrackedFlight,
  FlightSignalWorkflowError,
} from "@/features/flights/server/workflows";
import { refreshTrackedFlight } from "@/features/flights/server/polling";
import { getDatabase } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";
import { AirLabsSourceError } from "@/lib/sources/airlabs/errors";

function textValue(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function revalidateFlightConsumers() {
  revalidatePath("/flightsignal");
  revalidatePath("/home");
  revalidatePath("/home/globe");
}

function actionError(error: unknown): FlightSignalActionState {
  if (error instanceof z.ZodError) {
    return {
      status: "error",
      message: "Some fields need attention before this can be saved.",
      fieldErrors: error.flatten().fieldErrors,
    };
  }
  if (error instanceof FlightSignalWorkflowError) {
    return { status: "error", message: error.message };
  }

  console.error("[FlightSignal] A server action failed safely", {
    errorType: error instanceof Error ? error.name : typeof error,
  });
  return {
    status: "error",
    message:
      "FlightSignal could not save the change. Check the database connection and try again.",
  };
}

export async function lookupFlightRouteAction(
  passengerFlightNumber: string,
): Promise<FlightRouteLookupState> {
  try {
    const parsed = parseFlightDesignator(passengerFlightNumber);
    const database = getDatabase();
    const workspaceSlug = process.env.CREDSIGNAL_WORKSPACE_SLUG ?? "local";
    const [workspace] = await database
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, workspaceSlug))
      .limit(1);
    if (!workspace) {
      return {
        status: "error",
        message:
          "Priority Signals has not been initialized. Run the database seed command first.",
      };
    }
    const snapshot = await fetchAirLabsFlightForWorkspace({
      workspaceId: workspace.id,
      passengerFlightNumber: parsed.passengerFlightNumber,
      kind: "interactive",
      signal: new AbortController().signal,
    });
    const lookup = sealFlightLookup(snapshot);

    return {
      status: "success",
      confirmationToken: lookup.confirmationToken,
      flight: lookup.flight,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        status: "error",
        message:
          error.issues[0]?.message ?? "Enter a valid flight ID to continue.",
      };
    }
    if (error instanceof AirLabsRequestDeniedError) {
      return {
        status: "error",
        message: error.message,
      };
    }
    if (error instanceof AirLabsSourceError) {
      return { status: "error", message: error.safeMessage };
    }

    return {
      status: "error",
      message: "AirLabs could not resolve that flight safely.",
    };
  }
}

export async function createTrackedFlightAction(
  _previousState: FlightSignalActionState,
  formData: FormData,
): Promise<FlightSignalActionState> {
  try {
    const input = createFlightTrackingInputSchema.parse({
      personId: textValue(formData, "personId"),
      confirmationToken: textValue(formData, "confirmationToken"),
      notes: textValue(formData, "notes"),
    });
    const result = await createTrackedFlight(
      input,
      textValue(formData, "actorOperatorId") || undefined,
    );
    revalidateFlightConsumers();
    return {
      status: "success",
      message:
        "Flight assigned. AirLabs monitoring will begin on the quota-aware schedule.",
      flightInstanceId: result.flightInstanceId,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function refreshTrackedFlightAction(
  formData: FormData,
): Promise<FlightSignalActionState> {
  try {
    const flightInstanceId = z
      .string()
      .uuid()
      .parse(textValue(formData, "flightInstanceId"));
    const result = await refreshTrackedFlight(flightInstanceId, {
      signal: new AbortController().signal,
    });
    revalidateFlightConsumers();
    return {
      status: "success",
      message: "AirLabs flight data refreshed.",
      flightInstanceId: result.flightInstanceId,
    };
  } catch (error) {
    return actionError(error);
  }
}

async function changeAssignmentAction(
  formData: FormData,
  operation: typeof confirmTravelerOnboard,
  successMessage: string,
): Promise<FlightSignalActionState> {
  try {
    const result = await operation(
      { assignmentId: textValue(formData, "assignmentId") },
      textValue(formData, "actorOperatorId") || undefined,
    );
    revalidateFlightConsumers();
    return {
      status: "success",
      message: successMessage,
      flightInstanceId: result.flightInstanceId,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function confirmTravelerOnboardAction(formData: FormData) {
  return changeAssignmentAction(
    formData,
    confirmTravelerOnboard,
    "Traveler confirmed onboard. Aircraft position now represents inferred presence.",
  );
}

export async function completeTravelerFlightAction(formData: FormData) {
  return changeAssignmentAction(
    formData,
    completeTravelerFlight,
    "Travel completed. The person's approved location was not changed.",
  );
}

export async function cancelFlightAssignmentAction(formData: FormData) {
  return changeAssignmentAction(
    formData,
    cancelFlightAssignment,
    "Flight assignment cancelled.",
  );
}
