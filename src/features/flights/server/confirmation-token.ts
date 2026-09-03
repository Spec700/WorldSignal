import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import {
  airLabsResolvedFlightSchema,
  type AirLabsResolvedFlight,
} from "@/features/flights/domain";
import type { AirLabsFlightSnapshot } from "@/lib/sources/airlabs/adapter";
import { getAirLabsConfiguration } from "@/lib/sources/airlabs/config";

const TOKEN_LIFETIME_MS = 15 * 60 * 1_000;
const tokenPayloadSchema = z.object({
  version: z.literal(1),
  expiresAt: z.iso.datetime(),
  flight: airLabsResolvedFlightSchema,
});

export class FlightLookupTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlightLookupTokenError";
  }
}

function signingKey(environment?: NodeJS.ProcessEnv): Buffer {
  const { apiKey } = getAirLabsConfiguration(environment);
  return createHmac("sha256", apiKey)
    .update("priority-signals:flightsignal:confirmation:v1")
    .digest();
}

function signature(encodedPayload: string, environment?: NodeJS.ProcessEnv) {
  return createHmac("sha256", signingKey(environment))
    .update(encodedPayload)
    .digest("base64url");
}

function toResolvedFlight(
  snapshot: AirLabsFlightSnapshot,
): AirLabsResolvedFlight {
  const { usage: _usage, ...resolvedFlight } = snapshot;
  void _usage;
  return airLabsResolvedFlightSchema.parse(resolvedFlight);
}

export function sealFlightLookup(
  snapshot: AirLabsFlightSnapshot,
  options: { now?: Date; environment?: NodeJS.ProcessEnv } = {},
): { confirmationToken: string; flight: AirLabsResolvedFlight } {
  const now = options.now ?? new Date();
  const flight = toResolvedFlight(snapshot);
  const payload = tokenPayloadSchema.parse({
    version: 1,
    expiresAt: new Date(now.getTime() + TOKEN_LIFETIME_MS).toISOString(),
    flight,
  });
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  return {
    confirmationToken: `${encodedPayload}.${signature(encodedPayload, options.environment)}`,
    flight,
  };
}

export function openFlightLookup(
  token: string,
  options: { now?: Date; environment?: NodeJS.ProcessEnv } = {},
): AirLabsResolvedFlight {
  const [encodedPayload, suppliedSignature, unexpected] = token.split(".");
  if (!encodedPayload || !suppliedSignature || unexpected) {
    throw new FlightLookupTokenError(
      "The AirLabs confirmation has an invalid format. Look up the flight again.",
    );
  }

  const expectedSignature = signature(encodedPayload, options.environment);
  const supplied = Buffer.from(suppliedSignature, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    throw new FlightLookupTokenError(
      "The AirLabs confirmation could not be verified. Look up the flight again.",
    );
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString(),
    );
  } catch {
    throw new FlightLookupTokenError(
      "The AirLabs confirmation could not be read. Look up the flight again.",
    );
  }
  const payload = tokenPayloadSchema.safeParse(rawPayload);
  if (!payload.success) {
    throw new FlightLookupTokenError(
      "The AirLabs confirmation is incomplete. Look up the flight again.",
    );
  }
  if (new Date(payload.data.expiresAt) <= (options.now ?? new Date())) {
    throw new FlightLookupTokenError(
      "The AirLabs confirmation expired. Look up the flight again for current information.",
    );
  }

  return payload.data.flight;
}
