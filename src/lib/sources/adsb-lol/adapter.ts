import { SourceFetchError } from "@/lib/sources/errors";
import { fetchJson, type FetchImplementation } from "@/lib/sources/fetch-json";
import {
  retryTransientSourceRequest,
  type RetrySleep,
} from "@/lib/sources/retry";

import { adsbLolResponseSchema, vrsRouteSchema } from "./schema";
import {
  getAdsbLolCallsignUrl,
  getAdsbLolIcaoUrl,
  getVrsRouteUrl,
} from "./urls";

const ADSB_TIMEOUT_MS = 10_000;
const ADSB_MAX_BYTES = 512 * 1_024;
const ADSB_MAX_ATTEMPTS = 2;

export interface AdsbLolObservation {
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

function optionalTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function normalizeAdsbLolAircraft(
  raw: (typeof adsbLolResponseSchema._output)["ac"][number],
  upstreamNow: number,
  retrievedAt: string,
): AdsbLolObservation {
  const sourceAgeSeconds = raw.seen ?? 0;

  return {
    aircraftIcaoHex: raw.hex,
    callsign: optionalTrimmed(raw.flight)?.toUpperCase(),
    registration: optionalTrimmed(raw.r)?.toUpperCase(),
    aircraftType: optionalTrimmed(raw.t)?.toUpperCase(),
    ...(raw.lat !== undefined && raw.lat !== null ? { latitude: raw.lat } : {}),
    ...(raw.lon !== undefined && raw.lon !== null
      ? { longitude: raw.lon }
      : {}),
    ...(typeof raw.alt_baro === "number"
      ? { barometricAltitudeFeet: raw.alt_baro }
      : {}),
    ...(raw.alt_geom !== undefined && raw.alt_geom !== null
      ? { geometricAltitudeFeet: raw.alt_geom }
      : {}),
    ...(raw.gs !== undefined && raw.gs !== null
      ? { groundSpeedKnots: raw.gs }
      : {}),
    ...(raw.track !== undefined && raw.track !== null
      ? { trackDegrees: raw.track }
      : {}),
    ...(raw.baro_rate !== undefined && raw.baro_rate !== null
      ? { verticalRateFeetPerMinute: raw.baro_rate }
      : {}),
    ...(optionalTrimmed(raw.squawk) ? { squawk: raw.squawk?.trim() } : {}),
    onGround: raw.alt_baro === "ground",
    sourceObservedAt: new Date(
      upstreamNow - sourceAgeSeconds * 1_000,
    ).toISOString(),
    retrievedAt,
  };
}

interface AdsbLolAdapterOptions {
  fetchImplementation?: FetchImplementation;
  now?: () => Date;
  retrySleep?: RetrySleep;
}

export class AdsbLolAdapter {
  private readonly fetchImplementation?: FetchImplementation;
  private readonly now: () => Date;
  private readonly retrySleep?: RetrySleep;

  constructor(options: AdsbLolAdapterOptions = {}) {
    this.fetchImplementation = options.fetchImplementation;
    this.now = options.now ?? (() => new Date());
    this.retrySleep = options.retrySleep;
  }

  fetchByCallsign(callsign: string, signal: AbortSignal) {
    return this.fetchAircraft(getAdsbLolCallsignUrl(callsign), signal);
  }

  fetchByIcao(aircraftIcaoHex: string, signal: AbortSignal) {
    return this.fetchAircraft(getAdsbLolIcaoUrl(aircraftIcaoHex), signal);
  }

  private async fetchAircraft(url: URL, signal: AbortSignal) {
    const retrievedAt = this.now().toISOString();
    const raw = await retryTransientSourceRequest(
      () =>
        fetchJson(url, {
          signal,
          timeoutMs: ADSB_TIMEOUT_MS,
          maxBytes: ADSB_MAX_BYTES,
          sourceLabel: "ADSB.lol",
          fetchImplementation: this.fetchImplementation,
        }),
      {
        signal,
        maxAttempts: ADSB_MAX_ATTEMPTS,
        sleep: this.retrySleep,
      },
    );
    const parsed = adsbLolResponseSchema.safeParse(raw);

    if (!parsed.success) {
      throw new SourceFetchError(
        "schema",
        "ADSB.lol returned aircraft data that does not match the expected schema.",
        { cause: parsed.error },
      );
    }

    return parsed.data.ac.map((aircraft) =>
      normalizeAdsbLolAircraft(aircraft, parsed.data.now, retrievedAt),
    );
  }
}

export async function fetchVrsRouteSuggestion(
  callsign: string,
  signal: AbortSignal,
  fetchImplementation?: FetchImplementation,
) {
  const raw = await fetchJson(getVrsRouteUrl(callsign), {
    signal,
    timeoutMs: ADSB_TIMEOUT_MS,
    maxBytes: ADSB_MAX_BYTES,
    sourceLabel: "ADSB.lol route data",
    fetchImplementation,
  });
  const parsed = vrsRouteSchema.safeParse(raw);

  if (!parsed.success) {
    throw new SourceFetchError(
      "schema",
      "ADSB.lol returned route data that does not match the expected schema.",
      { cause: parsed.error },
    );
  }

  return parsed.data;
}
