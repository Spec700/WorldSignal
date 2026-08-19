import { z } from "zod";

const coordinateStringSchema = (minimum: number, maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .transform((value) => Number(value))
    .pipe(z.number().finite().min(minimum).max(maximum));

export const spcTornadoReportSchema = z.object({
  time: z
    .string()
    .trim()
    .regex(/^(?:[01]\d|2[0-3])[0-5]\d$/),
  fScale: z.string().trim().min(1),
  location: z.string().trim().min(1),
  county: z.string().trim().min(1),
  state: z.string().trim().length(2).toUpperCase(),
  latitude: coordinateStringSchema(-90, 90),
  longitude: coordinateStringSchema(-180, 180),
  comments: z.string().trim(),
});

export type SpcTornadoReport = z.infer<typeof spcTornadoReportSchema>;
