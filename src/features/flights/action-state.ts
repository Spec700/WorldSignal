export interface FlightSignalActionState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
  flightInstanceId?: string;
}

export const initialFlightSignalActionState: FlightSignalActionState = {
  status: "idle",
};

export type FlightRouteLookupState =
  | {
      status: "success";
      confirmationToken: string;
      flight: AirLabsResolvedFlight;
    }
  | {
      status: "error";
      message: string;
    };
import type { AirLabsResolvedFlight } from "@/features/flights/domain";
