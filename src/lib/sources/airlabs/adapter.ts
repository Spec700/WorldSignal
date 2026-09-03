import {
  findAirportByIata,
  type AirportDirectoryEntry,
} from "@/lib/airports/directory";
import { SourceFetchError } from "@/lib/sources/errors";
import { fetchJson, type FetchImplementation } from "@/lib/sources/fetch-json";

import { getAirLabsConfiguration, type AirLabsConfiguration } from "./config";
import { AirLabsSourceError, classifyAirLabsError } from "./errors";
import { airLabsEnvelopeSchema, airLabsFlightSchema } from "./schema";

const AIRLABS_FLIGHT_ENDPOINT = "https://airlabs.co/api/v9/flight";
const AIRLABS_TIMEOUT_MS = 10_000;
const AIRLABS_MAX_BYTES = 256 * 1_024;
const METERS_TO_FEET = 3.280_839_895;
const KILOMETERS_PER_HOUR_TO_KNOTS = 0.539_956_803;

type RawAirLabsFlight = typeof airLabsFlightSchema._output;
type AirLabsEnvelope = typeof airLabsEnvelopeSchema._output;
type AirLabsKey = NonNullable<NonNullable<AirLabsEnvelope["request"]>["key"]>;

export type AirLabsFlightPhase =
  "scheduled" | "active" | "landed" | "cancelled" | "unknown";

export interface AirLabsUsageSnapshot {
  keyId?: number;
  planType?: string;
  expiresAt?: string;
  monthlyLimit?: number;
  monthlyUsed?: number;
  monthlyRemaining?: number;
}

export interface AirLabsObservation {
  aircraftIcaoHex: string;
  callsign?: string;
  registration?: string;
  aircraftType?: string;
  latitude: number;
  longitude: number;
  barometricAltitudeFeet?: number;
  groundSpeedKnots?: number;
  trackDegrees?: number;
  squawk?: string;
  onGround: boolean;
  sourceObservedAt: string;
  retrievedAt: string;
}

export interface AirLabsFlightSnapshot {
  passengerFlightNumber: string;
  flightIcao?: string;
  flightNumber?: string;
  airlineIata?: string;
  airlineIcao?: string;
  airlineName?: string;
  origin: AirportDirectoryEntry;
  destination: AirportDirectoryEntry;
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
  providerStatus: string;
  phase: AirLabsFlightPhase;
  aircraftIcaoHex?: string;
  aircraftRegistration?: string;
  aircraftType?: string;
  aircraftModel?: string;
  aircraftManufacturer?: string;
  observation?: AirLabsObservation;
  usage: AirLabsUsageSnapshot;
  retrievedAt: string;
}

interface AirLabsAdapterOptions {
  configuration?: AirLabsConfiguration;
  environment?: NodeJS.ProcessEnv;
  fetchImplementation?: FetchImplementation;
  now?: () => Date;
}

function trimmed(value: string | null | undefined): string | undefined {
  const result = value?.trim();
  return result || undefined;
}

function upper(value: string | null | undefined): string | undefined {
  return trimmed(value)?.toUpperCase();
}

function timestamp(value: number | null | undefined): string | undefined {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return undefined;
  }
  const milliseconds = value < 1_000_000_000_000 ? value * 1_000 : value;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function finite(value: number | null | undefined): number | undefined {
  return value === undefined || value === null || !Number.isFinite(value)
    ? undefined
    : value;
}

export function normalizeAirLabsPhase(
  status: string | null | undefined,
): AirLabsFlightPhase {
  const normalized = status?.trim().toLowerCase() ?? "";
  if (["en-route", "en route", "active", "airborne"].includes(normalized)) {
    return "active";
  }
  if (["landed", "arrived"].includes(normalized)) {
    return "landed";
  }
  if (["cancelled", "canceled"].includes(normalized)) {
    return "cancelled";
  }
  if (["scheduled", "delayed", "boarding"].includes(normalized)) {
    return "scheduled";
  }
  return "unknown";
}

function normalizeUsage(key: AirLabsKey | undefined): AirLabsUsageSnapshot {
  if (!key || typeof key !== "object") {
    return {};
  }

  const monthlyLimit = finite(
    key.limits_by_month ?? key.limits?.month ?? key.limits?.monthly,
  );
  const monthlyUsed = finite(
    key.usage_by_month ?? key.usage?.month ?? key.usage?.monthly,
  );

  return {
    ...(key.id !== undefined && key.id !== null ? { keyId: key.id } : {}),
    ...(trimmed(key.type) ? { planType: trimmed(key.type) } : {}),
    ...(typeof key.expired === "string" ? { expiresAt: key.expired } : {}),
    ...(monthlyLimit !== undefined ? { monthlyLimit } : {}),
    ...(monthlyUsed !== undefined ? { monthlyUsed } : {}),
    ...(monthlyLimit !== undefined && monthlyUsed !== undefined
      ? { monthlyRemaining: Math.max(0, monthlyLimit - monthlyUsed) }
      : {}),
  };
}

function requireAirport(
  iata: string | undefined,
  providerName: string | undefined,
  role: "origin" | "destination",
): AirportDirectoryEntry {
  const airport = findAirportByIata(iata);
  if (!airport) {
    throw new AirLabsSourceError(
      "schema",
      `AirLabs returned a ${role} airport that is missing from the local airport directory.`,
      "backoff",
    );
  }

  return providerName ? { ...airport, name: providerName } : airport;
}

export function normalizeAirLabsFlight(
  raw: RawAirLabsFlight,
  requestedFlightIata: string,
  retrievedAt: string,
  usage: AirLabsUsageSnapshot = {},
): AirLabsFlightSnapshot {
  const passengerFlightNumber = upper(raw.flight_iata);
  if (!passengerFlightNumber || passengerFlightNumber !== requestedFlightIata) {
    throw new AirLabsSourceError(
      "schema",
      "AirLabs returned a flight that did not match the requested flight ID.",
      "backoff",
    );
  }

  const scheduledDepartureAt = timestamp(raw.dep_time_ts);
  if (!scheduledDepartureAt) {
    throw new AirLabsSourceError(
      "schema",
      "AirLabs did not return a dated scheduled departure for this flight.",
      "not_found",
    );
  }

  const providerStatus = trimmed(raw.status) ?? "unknown";
  const phase = normalizeAirLabsPhase(providerStatus);
  const latitude = finite(raw.lat);
  const longitude = finite(raw.lng);
  const aircraftIcaoHex = upper(raw.hex)?.toLowerCase();
  const observation =
    aircraftIcaoHex &&
    latitude !== undefined &&
    longitude !== undefined &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
      ? {
          aircraftIcaoHex,
          ...(upper(raw.flight_icao)
            ? { callsign: upper(raw.flight_icao) }
            : {}),
          ...(upper(raw.reg_number)
            ? { registration: upper(raw.reg_number) }
            : {}),
          ...(upper(raw.aircraft_icao)
            ? { aircraftType: upper(raw.aircraft_icao) }
            : {}),
          latitude,
          longitude,
          ...(finite(raw.alt) !== undefined
            ? { barometricAltitudeFeet: finite(raw.alt)! * METERS_TO_FEET }
            : {}),
          ...(finite(raw.speed) !== undefined
            ? {
                groundSpeedKnots:
                  finite(raw.speed)! * KILOMETERS_PER_HOUR_TO_KNOTS,
              }
            : {}),
          ...(finite(raw.dir) !== undefined
            ? { trackDegrees: finite(raw.dir) }
            : {}),
          ...(trimmed(raw.squawk) ? { squawk: trimmed(raw.squawk) } : {}),
          onGround: phase === "landed",
          sourceObservedAt: timestamp(raw.updated) ?? retrievedAt,
          retrievedAt,
        }
      : undefined;

  return {
    passengerFlightNumber,
    ...(upper(raw.flight_icao) ? { flightIcao: upper(raw.flight_icao) } : {}),
    ...(trimmed(raw.flight_number)
      ? { flightNumber: trimmed(raw.flight_number) }
      : {}),
    ...(upper(raw.airline_iata)
      ? { airlineIata: upper(raw.airline_iata) }
      : {}),
    ...(upper(raw.airline_icao)
      ? { airlineIcao: upper(raw.airline_icao) }
      : {}),
    ...(trimmed(raw.airline_name)
      ? { airlineName: trimmed(raw.airline_name) }
      : {}),
    origin: requireAirport(
      upper(raw.dep_iata),
      trimmed(raw.dep_name),
      "origin",
    ),
    destination: requireAirport(
      upper(raw.arr_iata),
      trimmed(raw.arr_name),
      "destination",
    ),
    scheduledDepartureAt,
    ...(timestamp(raw.arr_time_ts)
      ? { scheduledArrivalAt: timestamp(raw.arr_time_ts) }
      : {}),
    ...(timestamp(raw.dep_estimated_ts)
      ? { estimatedDepartureAt: timestamp(raw.dep_estimated_ts) }
      : {}),
    ...(timestamp(raw.dep_actual_ts)
      ? { actualDepartureAt: timestamp(raw.dep_actual_ts) }
      : {}),
    ...(timestamp(raw.arr_estimated_ts)
      ? { estimatedArrivalAt: timestamp(raw.arr_estimated_ts) }
      : {}),
    ...(timestamp(raw.arr_actual_ts)
      ? { actualArrivalAt: timestamp(raw.arr_actual_ts) }
      : {}),
    ...(trimmed(raw.dep_terminal)
      ? { departureTerminal: trimmed(raw.dep_terminal) }
      : {}),
    ...(trimmed(raw.dep_gate) ? { departureGate: trimmed(raw.dep_gate) } : {}),
    ...(trimmed(raw.arr_terminal)
      ? { destinationTerminal: trimmed(raw.arr_terminal) }
      : {}),
    ...(trimmed(raw.arr_gate)
      ? { destinationGate: trimmed(raw.arr_gate) }
      : {}),
    ...(trimmed(raw.arr_baggage)
      ? { destinationBaggage: trimmed(raw.arr_baggage) }
      : {}),
    ...(finite(raw.dep_delayed) !== undefined
      ? { departureDelayMinutes: finite(raw.dep_delayed) }
      : {}),
    ...(finite(raw.arr_delayed) !== undefined
      ? { arrivalDelayMinutes: finite(raw.arr_delayed) }
      : {}),
    ...(finite(raw.duration) !== undefined
      ? { durationMinutes: finite(raw.duration) }
      : {}),
    ...(finite(raw.percent) !== undefined
      ? { progressPercent: finite(raw.percent) }
      : {}),
    ...(finite(raw.eta) !== undefined ? { etaMinutes: finite(raw.eta) } : {}),
    providerStatus,
    phase,
    ...(aircraftIcaoHex ? { aircraftIcaoHex } : {}),
    ...(upper(raw.reg_number)
      ? { aircraftRegistration: upper(raw.reg_number) }
      : {}),
    ...(upper(raw.aircraft_icao)
      ? { aircraftType: upper(raw.aircraft_icao) }
      : {}),
    ...(trimmed(raw.aircraft_model)
      ? { aircraftModel: trimmed(raw.aircraft_model) }
      : {}),
    ...(trimmed(raw.aircraft_manufacturer)
      ? { aircraftManufacturer: trimmed(raw.aircraft_manufacturer) }
      : {}),
    ...(observation ? { observation } : {}),
    usage,
    retrievedAt,
  };
}

export class AirLabsAdapter {
  private readonly configuration: AirLabsConfiguration;
  private readonly fetchImplementation?: FetchImplementation;
  private readonly now: () => Date;

  constructor(options: AirLabsAdapterOptions = {}) {
    this.configuration =
      options.configuration ?? getAirLabsConfiguration(options.environment);
    this.fetchImplementation = options.fetchImplementation;
    this.now = options.now ?? (() => new Date());
  }

  get keyFingerprint(): string {
    return this.configuration.keyFingerprint;
  }

  async fetchFlight(
    passengerFlightNumber: string,
    signal: AbortSignal,
  ): Promise<AirLabsFlightSnapshot> {
    const normalizedFlightNumber = passengerFlightNumber
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, "");
    const url = new URL(AIRLABS_FLIGHT_ENDPOINT);
    url.searchParams.set("flight_iata", normalizedFlightNumber);
    url.searchParams.set("api_key", this.configuration.apiKey);
    const retrievedAt = this.now().toISOString();
    let raw: unknown;

    try {
      raw = await fetchJson(url, {
        signal,
        timeoutMs: AIRLABS_TIMEOUT_MS,
        maxBytes: AIRLABS_MAX_BYTES,
        sourceLabel: "AirLabs",
        fetchImplementation: this.fetchImplementation,
      });
    } catch (error) {
      if (error instanceof AirLabsSourceError) {
        throw error;
      }
      if (error instanceof SourceFetchError) {
        const directive = error.code === "http" ? "backoff" : "backoff";
        throw new AirLabsSourceError(
          error.code,
          error.safeMessage,
          directive,
          undefined,
          { cause: error },
        );
      }
      throw error;
    }

    const parsed = airLabsEnvelopeSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AirLabsSourceError(
        "schema",
        "AirLabs returned flight data that does not match the expected schema.",
        "backoff",
        undefined,
        { cause: parsed.error },
      );
    }

    if (parsed.data.error) {
      const providerCode = parsed.data.error.code?.toString();
      const directive = classifyAirLabsError(
        providerCode,
        parsed.data.error.message,
      );
      const safeMessage =
        directive === "pause"
          ? "AirLabs is paused because the provider rejected the account, key, or quota."
          : directive === "not_found"
            ? `AirLabs could not find ${normalizedFlightNumber} in its current flight data.`
            : "AirLabs returned a provider error. FlightSignal will back off before trying again.";
      throw new AirLabsSourceError(
        "http",
        safeMessage,
        directive,
        providerCode,
      );
    }

    const response = Array.isArray(parsed.data.response)
      ? parsed.data.response[0]
      : parsed.data.response;
    if (!response) {
      throw new AirLabsSourceError(
        "schema",
        `AirLabs could not find ${normalizedFlightNumber} in its current flight data.`,
        "not_found",
      );
    }

    return normalizeAirLabsFlight(
      response,
      normalizedFlightNumber,
      retrievedAt,
      normalizeUsage(parsed.data.request?.key),
    );
  }
}
