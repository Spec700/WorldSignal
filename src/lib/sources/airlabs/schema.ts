import { z } from "zod";

const optionalString = z.string().nullable().optional();
const optionalNumber = z.number().finite().nullable().optional();

export const airLabsFlightSchema = z
  .object({
    hex: optionalString,
    reg_number: optionalString,
    flag: optionalString,
    lat: optionalNumber,
    lng: optionalNumber,
    alt: optionalNumber,
    dir: optionalNumber,
    speed: optionalNumber,
    v_speed: optionalNumber,
    squawk: optionalString,
    flight_number: optionalString,
    flight_icao: optionalString,
    flight_iata: optionalString,
    airline_icao: optionalString,
    airline_iata: optionalString,
    airline_name: optionalString,
    aircraft_icao: optionalString,
    aircraft_model: optionalString,
    aircraft_manufacturer: optionalString,
    dep_icao: optionalString,
    dep_iata: optionalString,
    dep_name: optionalString,
    dep_time_ts: optionalNumber,
    dep_estimated_ts: optionalNumber,
    dep_actual_ts: optionalNumber,
    dep_terminal: optionalString,
    dep_gate: optionalString,
    dep_delayed: optionalNumber,
    arr_icao: optionalString,
    arr_iata: optionalString,
    arr_name: optionalString,
    arr_time_ts: optionalNumber,
    arr_estimated_ts: optionalNumber,
    arr_actual_ts: optionalNumber,
    arr_terminal: optionalString,
    arr_gate: optionalString,
    arr_baggage: optionalString,
    arr_delayed: optionalNumber,
    duration: optionalNumber,
    delayed: optionalNumber,
    updated: optionalNumber,
    status: optionalString,
    percent: optionalNumber,
    eta: optionalNumber,
  })
  .passthrough();

const airLabsKeySchema = z
  .object({
    id: z.number().int().nullable().optional(),
    type: optionalString,
    expired: z.union([z.string(), z.boolean()]).nullable().optional(),
    limits: z.record(z.string(), z.number()).optional(),
    usage: z.record(z.string(), z.number()).optional(),
    limits_by_month: optionalNumber,
    usage_by_month: optionalNumber,
  })
  .passthrough();

export const airLabsEnvelopeSchema = z
  .object({
    request: z
      .object({
        key: airLabsKeySchema.optional(),
      })
      .passthrough()
      .optional(),
    response: z
      .union([airLabsFlightSchema, z.array(airLabsFlightSchema)])
      .nullable()
      .optional(),
    error: z
      .object({
        code: z.union([z.string(), z.number()]).optional(),
        message: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
