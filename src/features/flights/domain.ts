import { z } from "zod";

const flightDesignatorSchema = z
  .string()
  .trim()
  .toUpperCase()
  .transform((value) => value.replace(/[\s-]+/g, ""))
  .pipe(
    z
      .string()
      .regex(
        /^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/,
        "Enter an airline code and flight number, such as UA 2276.",
      ),
  );

const airportSnapshotSchema = z.object({
  iata: z.string().regex(/^[A-Z]{3}$/),
  icao: z.string().min(3).max(4),
  name: z.string().trim().min(1).max(200),
  city: z.string().max(200),
  country: z.string().max(200),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  timezone: z.string().optional(),
});

const optionalUtcTimestamp = z.iso.datetime().optional();

export const airLabsResolvedFlightSchema = z.object({
  passengerFlightNumber: flightDesignatorSchema,
  flightIcao: z.string().trim().max(12).optional(),
  flightNumber: z.string().trim().max(8).optional(),
  airlineIata: z.string().trim().max(3).optional(),
  airlineIcao: z.string().trim().max(4).optional(),
  airlineName: z.string().trim().max(200).optional(),
  origin: airportSnapshotSchema,
  destination: airportSnapshotSchema,
  scheduledDepartureAt: z.iso.datetime(),
  scheduledArrivalAt: optionalUtcTimestamp,
  estimatedDepartureAt: optionalUtcTimestamp,
  actualDepartureAt: optionalUtcTimestamp,
  estimatedArrivalAt: optionalUtcTimestamp,
  actualArrivalAt: optionalUtcTimestamp,
  departureTerminal: z.string().trim().max(40).optional(),
  departureGate: z.string().trim().max(40).optional(),
  destinationTerminal: z.string().trim().max(40).optional(),
  destinationGate: z.string().trim().max(40).optional(),
  destinationBaggage: z.string().trim().max(80).optional(),
  departureDelayMinutes: z.number().finite().optional(),
  arrivalDelayMinutes: z.number().finite().optional(),
  durationMinutes: z.number().finite().positive().optional(),
  progressPercent: z.number().finite().min(0).max(100).optional(),
  etaMinutes: z.number().finite().nonnegative().optional(),
  providerStatus: z.string().trim().min(1).max(80),
  phase: z.enum(["scheduled", "active", "landed", "cancelled", "unknown"]),
  aircraftIcaoHex: z
    .string()
    .regex(/^[0-9a-f]{6}$/)
    .optional(),
  aircraftRegistration: z.string().trim().max(20).optional(),
  aircraftType: z.string().trim().max(20).optional(),
  aircraftModel: z.string().trim().max(120).optional(),
  aircraftManufacturer: z.string().trim().max(120).optional(),
  observation: z
    .object({
      aircraftIcaoHex: z.string().regex(/^[0-9a-f]{6}$/),
      callsign: z.string().trim().max(12).optional(),
      registration: z.string().trim().max(20).optional(),
      aircraftType: z.string().trim().max(20).optional(),
      latitude: z.number().finite().min(-90).max(90),
      longitude: z.number().finite().min(-180).max(180),
      barometricAltitudeFeet: z.number().finite().optional(),
      groundSpeedKnots: z.number().finite().optional(),
      trackDegrees: z.number().finite().min(0).max(360).optional(),
      squawk: z.string().trim().max(8).optional(),
      onGround: z.boolean(),
      sourceObservedAt: z.iso.datetime(),
      retrievedAt: z.iso.datetime(),
    })
    .optional(),
  retrievedAt: z.iso.datetime(),
});

export type AirLabsResolvedFlight = z.infer<typeof airLabsResolvedFlightSchema>;

export const createFlightTrackingInputSchema = z.object({
  personId: z.string().uuid(),
  confirmationToken: z.string().trim().min(40).max(40_000),
  notes: z.string().trim().max(4_000).optional().default(""),
});

export type CreateFlightTrackingInput = z.input<
  typeof createFlightTrackingInputSchema
>;

export interface ParsedFlightDesignator {
  passengerFlightNumber: string;
  airlineCode: string;
  flightNumber: string;
}

export function parseFlightDesignator(value: string): ParsedFlightDesignator {
  const passengerFlightNumber = flightDesignatorSchema.parse(value);
  const airlineCode = /^[A-Z]$/.test(passengerFlightNumber[2] ?? "")
    ? passengerFlightNumber.slice(0, 3)
    : passengerFlightNumber.slice(0, 2);
  const flightNumber = passengerFlightNumber.slice(airlineCode.length);
  const match = flightNumber.match(/^\d{1,4}[A-Z]?$/);

  if (!match) {
    throw new Error("Validated flight designator could not be parsed.");
  }

  return {
    passengerFlightNumber,
    airlineCode,
    flightNumber,
  };
}

export const changeFlightAssignmentInputSchema = z.object({
  assignmentId: z.string().uuid(),
});
