import { z } from "zod";

const nullableFiniteNumber = z.number().finite().nullable().optional();

export const adsbLolAircraftSchema = z
  .object({
    hex: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[0-9a-f]{6}$/),
    flight: z.string().optional(),
    r: z.string().optional(),
    t: z.string().optional(),
    lat: nullableFiniteNumber,
    lon: nullableFiniteNumber,
    alt_baro: z.union([z.number().finite(), z.literal("ground")]).optional(),
    alt_geom: nullableFiniteNumber,
    gs: nullableFiniteNumber,
    track: nullableFiniteNumber,
    baro_rate: nullableFiniteNumber,
    squawk: z.string().optional(),
    seen: z.number().finite().min(0).optional(),
    seen_pos: z.number().finite().min(0).optional(),
  })
  .passthrough();

export const adsbLolResponseSchema = z.object({
  ac: z.array(adsbLolAircraftSchema),
  msg: z.string(),
  now: z.number().finite(),
  total: z.number().int().nonnegative(),
});

export const vrsAirportSchema = z.object({
  name: z.string().trim().min(1),
  icao: z.string().trim().toUpperCase(),
  iata: z.string().trim().toUpperCase(),
  location: z.string(),
  countryiso2: z.string(),
  lat: z.number().finite().min(-90).max(90),
  lon: z.number().finite().min(-180).max(180),
  alt_feet: z.number().finite().nullable().optional(),
});

export const vrsRouteSchema = z.object({
  callsign: z.string().trim().toUpperCase(),
  number: z.string(),
  airline_code: z.string(),
  airport_codes: z.string(),
  _airport_codes_iata: z.string(),
  _airports: z.array(vrsAirportSchema).min(2),
});
