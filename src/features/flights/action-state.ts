export interface FlightSignalActionState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
  flightInstanceId?: string;
}

export const initialFlightSignalActionState: FlightSignalActionState = {
  status: "idle",
};

export interface FlightRouteLookupState {
  status: "success" | "error";
  message?: string;
  passengerFlightNumber?: string;
  adsbCallsign?: string;
  airports?: Array<{
    name: string;
    icao: string;
    iata: string;
    location: string;
    countryCode: string;
    latitude: number;
    longitude: number;
  }>;
}
