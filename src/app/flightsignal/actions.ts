"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type {
  FlightRouteLookupState,
  FlightSignalActionState,
} from "@/features/flights/action-state";
import {
  createFlightTrackingInputSchema,
  parseFlightDesignator,
  resolveAdsbCallsign,
} from "@/features/flights/domain";
import {
  cancelFlightAssignment,
  completeTravelerFlight,
  confirmFlightAircraft,
  confirmTravelerOnboard,
  createTrackedFlight,
  FlightSignalWorkflowError,
} from "@/features/flights/server/workflows";
import { SourceFetchError } from "@/lib/sources/errors";
import { fetchVrsRouteSuggestion } from "@/lib/sources/adsb-lol/adapter";

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
  adsbCallsignOverride?: string,
): Promise<FlightRouteLookupState> {
  try {
    const parsed = parseFlightDesignator(passengerFlightNumber);
    const adsbCallsign = resolveAdsbCallsign(
      parsed.passengerFlightNumber,
      adsbCallsignOverride,
    );
    const route = await fetchVrsRouteSuggestion(
      adsbCallsign,
      new AbortController().signal,
    );

    return {
      status: "success",
      passengerFlightNumber: parsed.passengerFlightNumber,
      adsbCallsign,
      airports: route._airports.map((airport) => ({
        name: airport.name,
        icao: airport.icao,
        iata: airport.iata,
        location: airport.location,
        countryCode: airport.countryiso2,
        latitude: airport.lat,
        longitude: airport.lon,
      })),
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        status: "error",
        message:
          error.issues[0]?.message ?? "Enter a valid flight ID to continue.",
      };
    }
    if (error instanceof SourceFetchError) {
      return {
        status: "error",
        message:
          "No validated route suggestion is available for that callsign. Check the flight ID or ADS-B callsign and try again.",
      };
    }
    if (error instanceof Error) {
      return { status: "error", message: error.message };
    }

    return {
      status: "error",
      message: "The route suggestion could not be loaded safely.",
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
      passengerFlightNumber: textValue(formData, "passengerFlightNumber"),
      adsbCallsign: textValue(formData, "adsbCallsign"),
      originIata: textValue(formData, "originIata"),
      originName: textValue(formData, "originName"),
      originLatitude: textValue(formData, "originLatitude"),
      originLongitude: textValue(formData, "originLongitude"),
      destinationIata: textValue(formData, "destinationIata"),
      destinationName: textValue(formData, "destinationName"),
      destinationLatitude: textValue(formData, "destinationLatitude"),
      destinationLongitude: textValue(formData, "destinationLongitude"),
      scheduledDepartureAt: textValue(formData, "scheduledDepartureAt"),
      scheduledArrivalAt: textValue(formData, "scheduledArrivalAt"),
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
        "Flight assigned. FlightSignal will look for an aircraft near the departure window.",
      flightInstanceId: result.flightInstanceId,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function confirmFlightAircraftAction(
  formData: FormData,
): Promise<FlightSignalActionState> {
  try {
    const result = await confirmFlightAircraft(
      {
        flightInstanceId: textValue(formData, "flightInstanceId"),
        aircraftIcaoHex: textValue(formData, "aircraftIcaoHex"),
      },
      textValue(formData, "actorOperatorId") || undefined,
    );
    revalidateFlightConsumers();
    return {
      status: "success",
      message: "Aircraft match confirmed. Confirm each traveler onboard next.",
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
