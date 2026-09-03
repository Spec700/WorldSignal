import type {
  PersonStatus,
  PersonTier,
  PrioritySignalsOperatorDto,
} from "@/features/people/types";

export type FlightTrackingStatus =
  | "scheduled"
  | "match_required"
  | "tracking"
  | "possible_arrival"
  | "completed"
  | "cancelled";

export type FlightAssignmentStatus =
  "planned" | "onboard_confirmed" | "completed" | "cancelled";

export type FlightDisplayStatus =
  | "scheduled"
  | "awaiting_signal"
  | "match_required"
  | "live_airborne"
  | "live_ground"
  | "signal_stale"
  | "source_error"
  | "possible_arrival"
  | "completed"
  | "cancelled";

export interface FlightPersonDto {
  id: string;
  displayName: string;
  title?: string;
  organization?: string;
  tier: PersonTier;
  status: PersonStatus;
}

export interface FlightObservationDto {
  id: string;
  aircraftIcaoHex: string;
  callsign?: string;
  registration?: string;
  aircraftType?: string;
  latitude?: number;
  longitude?: number;
  barometricAltitudeFeet?: number;
  geometricAltitudeFeet?: number;
  groundSpeedKnots?: number;
  trackDegrees?: number;
  verticalRateFeetPerMinute?: number;
  squawk?: string;
  onGround: boolean;
  sourceObservedAt: string;
  retrievedAt: string;
}

export interface FlightAssignmentDto {
  id: string;
  person: FlightPersonDto;
  status: FlightAssignmentStatus;
  assignedAt: string;
  onboardConfirmedAt?: string;
  completedAt?: string;
  notes?: string;
}

export interface TrackedFlightDto {
  id: string;
  passengerFlightNumber: string;
  providerFlightIcao?: string;
  airlineIata?: string;
  airlineIcao?: string;
  airlineName?: string;
  origin: {
    iata: string;
    icao?: string;
    name: string;
    latitude: number;
    longitude: number;
  };
  destination: {
    iata: string;
    icao?: string;
    name: string;
    latitude: number;
    longitude: number;
  };
  scheduledDepartureAt: string;
  scheduledArrivalAt?: string;
  estimatedDepartureAt?: string;
  actualDepartureAt?: string;
  estimatedArrivalAt?: string;
  actualArrivalAt?: string;
  departureTerminal?: string;
  departureGate?: string;
  destinationTerminal?: string;
  destinationGate?: string;
  destinationBaggage?: string;
  departureDelayMinutes?: number;
  arrivalDelayMinutes?: number;
  durationMinutes?: number;
  progressPercent?: number;
  etaMinutes?: number;
  providerStatus?: string;
  trackingStatus: FlightTrackingStatus;
  displayStatus: FlightDisplayStatus;
  aircraftIcaoHex?: string;
  aircraftRegistration?: string;
  aircraftType?: string;
  aircraftModel?: string;
  aircraftManufacturer?: string;
  aircraftResolvedAt?: string;
  aircraftConfirmedAt?: string;
  lastPolledAt?: string;
  lastSuccessfulPollAt?: string;
  nextPollAt?: string;
  consecutiveSourceErrors: number;
  sourceErrorCode?: string;
  lastSourceError?: string;
  notes?: string;
  assignments: FlightAssignmentDto[];
  latestObservation?: FlightObservationDto;
  candidateAircraft: FlightObservationDto[];
  trail: FlightObservationDto[];
  createdAt: string;
  updatedAt: string;
}

export interface FlightSignalDashboardDto {
  setupRequired: boolean;
  generatedAt: string;
  workspace?: {
    id: string;
    name: string;
    slug: string;
  };
  operators: PrioritySignalsOperatorDto[];
  people: FlightPersonDto[];
  flights: TrackedFlightDto[];
  metrics: {
    tracked: number;
    activeTravelers: number;
    attention: number;
    sourceErrors: number;
  };
  source: {
    label: "AirLabs";
    authentication: "Server API key";
    available: boolean;
    paused: boolean;
    pauseReason?: string;
    planType?: string;
    providerExpiresAt?: string;
    providerMonthlyLimit?: number;
    providerMonthlyUsed?: number;
    providerMonthlyRemaining?: number;
    automationRequestCount: number;
    automationRequestCap: number;
    interactiveRequestCount: number;
    lastRequestAt?: string;
    lastSuccessfulAt?: string;
    lastError?: string;
  };
}
