import { z } from "zod";

const epochMillisecondsSchema = z
  .number()
  .int()
  .min(0)
  .max(8_640_000_000_000_000);

export const usgsAlertSchema = z.enum(["green", "yellow", "orange", "red"]);

export const usgsFeatureSchema = z.object({
  type: z.literal("Feature"),
  id: z.string().trim().min(1),
  properties: z.object({
    mag: z.number().finite(),
    place: z.string().trim().min(1).nullable(),
    time: epochMillisecondsSchema,
    updated: epochMillisecondsSchema,
    url: z.url().refine((url) => url.startsWith("https://")),
    felt: z.number().int().nonnegative().nullable(),
    cdi: z.number().finite().nullable(),
    mmi: z.number().finite().nullable(),
    alert: usgsAlertSchema.nullable(),
    status: z.string().trim().min(1),
    tsunami: z.union([z.literal(0), z.literal(1)]),
    sig: z.number().int().nonnegative(),
    magType: z.string().trim().min(1).nullable(),
    type: z.string().trim().min(1),
  }),
  geometry: z.object({
    type: z.literal("Point"),
    coordinates: z
      .tuple([
        z.number().finite().min(-180).max(180),
        z.number().finite().min(-90).max(90),
        z.number().finite(),
      ])
      .rest(z.number().finite()),
  }),
});

export const usgsFeedSchema = z.object({
  type: z.literal("FeatureCollection"),
  metadata: z.object({
    generated: epochMillisecondsSchema,
    url: z.url(),
    title: z.string().trim().min(1),
    status: z.number().int(),
    api: z.string().trim().min(1),
    count: z.number().int().nonnegative(),
  }),
  features: z.array(usgsFeatureSchema),
});

export type UsgsAlert = z.infer<typeof usgsAlertSchema>;
export type UsgsFeature = z.infer<typeof usgsFeatureSchema>;
export type UsgsFeed = z.infer<typeof usgsFeedSchema>;
