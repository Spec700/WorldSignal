import { z } from "zod";

export const gdacsEventTypeSchema = z.enum(["TC", "FL", "DR", "VO", "WF"]);

export const gdacsAlertLevelSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.enum(["green", "orange", "red"]));

const gdacsBooleanSchema = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => value === true || value === "true");

const gdacsDateSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => {
    const withTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
      ? value
      : `${value}Z`;
    return !Number.isNaN(Date.parse(withTimezone));
  }, "Expected a GDACS date-time");

const gdacsAffectedCountrySchema = z.object({
  iso2: z.string().trim().max(2),
  iso3: z.string().trim().max(3),
  countryname: z.string().trim().min(1),
});

const gdacsSeveritySchema = z.object({
  severity: z.number().finite(),
  severitytext: z.string(),
  severityunit: z.string(),
});

export const gdacsFeatureSchema = z.object({
  type: z.literal("Feature"),
  geometry: z.object({
    type: z.literal("Point"),
    coordinates: z
      .tuple([
        z.number().finite().min(-180).max(180),
        z.number().finite().min(-90).max(90),
      ])
      .rest(z.number().finite()),
  }),
  properties: z.object({
    eventtype: gdacsEventTypeSchema,
    eventid: z.number().int().positive(),
    episodeid: z.number().int().nonnegative(),
    name: z.string().trim().min(1),
    description: z.string(),
    url: z.object({
      geometry: z.url().refine((url) => url.startsWith("https://")),
      report: z.url().refine((url) => url.startsWith("https://")),
      details: z.url().optional(),
    }),
    alertlevel: gdacsAlertLevelSchema,
    alertscore: z.number().finite(),
    iscurrent: gdacsBooleanSchema,
    country: z.string(),
    fromdate: gdacsDateSchema,
    todate: gdacsDateSchema,
    datemodified: gdacsDateSchema,
    iso3: z.string().trim().max(3),
    source: z.string(),
    affectedcountries: z.array(gdacsAffectedCountrySchema),
    severitydata: gdacsSeveritySchema,
  }),
});

export const gdacsSearchResponseSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(gdacsFeatureSchema),
});

export type GdacsEventType = z.infer<typeof gdacsEventTypeSchema>;
export type GdacsAlertLevel = z.infer<typeof gdacsAlertLevelSchema>;
export type GdacsFeature = z.infer<typeof gdacsFeatureSchema>;
export type GdacsSearchResponse = z.infer<typeof gdacsSearchResponseSchema>;
