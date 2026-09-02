import { z } from "zod";

const airlineIcaoByIata: Readonly<Record<string, string>> = {
  "6E": "IGO",
  AA: "AAL",
  AC: "ACA",
  AF: "AFR",
  AS: "ASA",
  B6: "JBU",
  BA: "BAW",
  CX: "CPA",
  DL: "DAL",
  EK: "UAE",
  F9: "FFT",
  FR: "RYR",
  JL: "JAL",
  KL: "KLM",
  LH: "DLH",
  NH: "ANA",
  NK: "NKS",
  QF: "QFA",
  QR: "QTR",
  SQ: "SIA",
  TK: "THY",
  U2: "EZY",
  UA: "UAL",
  VS: "VIR",
  WN: "SWA",
};

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

const providerCallsignSchema = z
  .string()
  .trim()
  .toUpperCase()
  .transform((value) => value.replace(/\s+/g, ""))
  .pipe(
    z
      .string()
      .regex(
        /^[A-Z0-9]{3,8}$/,
        "The ADS-B callsign must contain 3 to 8 letters or numbers.",
      ),
  );

const airportCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.string().regex(/^[A-Z]{3}$/, "Enter a three-letter IATA code."));

const coordinateSchema = (label: string, minimum: number, maximum: number) =>
  z.coerce
    .number()
    .finite()
    .min(minimum, `${label} must be between ${minimum} and ${maximum}.`)
    .max(maximum, `${label} must be between ${minimum} and ${maximum}.`);

const optionalDateSchema = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.date().optional(),
);

export const createFlightTrackingInputSchema = z
  .object({
    personId: z.string().uuid(),
    passengerFlightNumber: flightDesignatorSchema,
    adsbCallsign: z.preprocess(
      (value) => (value === "" || value === null ? undefined : value),
      providerCallsignSchema.optional(),
    ),
    originIata: airportCodeSchema,
    originName: z.string().trim().min(1).max(200),
    originLatitude: coordinateSchema("Origin latitude", -90, 90),
    originLongitude: coordinateSchema("Origin longitude", -180, 180),
    destinationIata: airportCodeSchema,
    destinationName: z.string().trim().min(1).max(200),
    destinationLatitude: coordinateSchema("Destination latitude", -90, 90),
    destinationLongitude: coordinateSchema("Destination longitude", -180, 180),
    scheduledDepartureAt: z.coerce.date(),
    scheduledArrivalAt: optionalDateSchema,
    notes: z.string().trim().max(4_000).optional().default(""),
  })
  .superRefine((input, context) => {
    if (input.originIata === input.destinationIata) {
      context.addIssue({
        code: "custom",
        message: "Origin and destination must be different airports.",
        path: ["destinationIata"],
      });
    }

    if (
      input.scheduledArrivalAt &&
      input.scheduledArrivalAt <= input.scheduledDepartureAt
    ) {
      context.addIssue({
        code: "custom",
        message: "Scheduled arrival must be after scheduled departure.",
        path: ["scheduledArrivalAt"],
      });
    }
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

export function resolveAdsbCallsign(
  passengerFlightNumber: string,
  override?: string,
): string {
  if (override) {
    return providerCallsignSchema.parse(override);
  }

  const parsed = parseFlightDesignator(passengerFlightNumber);
  if (parsed.airlineCode.length === 3) {
    return `${parsed.airlineCode}${parsed.flightNumber}`;
  }

  const icaoCode = airlineIcaoByIata[parsed.airlineCode];
  if (!icaoCode) {
    throw new Error(
      `${parsed.airlineCode} is not in the local airline mapping. Enter the flight's ADS-B callsign to continue.`,
    );
  }

  return `${icaoCode}${parsed.flightNumber}`;
}

export const confirmAircraftInputSchema = z.object({
  flightInstanceId: z.string().uuid(),
  aircraftIcaoHex: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[0-9a-f]{6}$/, "Enter a six-character ICAO aircraft address."),
});

export const changeFlightAssignmentInputSchema = z.object({
  assignmentId: z.string().uuid(),
});
