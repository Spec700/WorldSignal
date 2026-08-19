import { z } from "zod";

export const identityTypes = [
  "work_email",
  "personal_email",
  "username",
  "phone",
  "domain",
  "other",
] as const;

export const personTiers = ["standard", "high", "critical"] as const;
export const personStatuses = ["active", "paused", "archived"] as const;
export const locationPrecisions = [
  "exact",
  "city",
  "region",
  "country",
] as const;

export type IdentityType = (typeof identityTypes)[number];

const trimmedText = (label: string, maximum: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(maximum, `${label} must be ${maximum} characters or fewer.`);

export const createPersonInputSchema = z.object({
  displayName: trimmedText("Person name", 160),
  title: z.string().trim().max(160).optional().default(""),
  organization: z.string().trim().max(200).optional().default(""),
  tier: z.enum(personTiers).default("standard"),
  notes: z.string().trim().max(4_000).optional().default(""),
  identityType: z.enum(identityTypes),
  identityValue: trimmedText("Identity", 320),
  locationLabel: trimmedText("Location label", 160),
  latitude: z.coerce
    .number()
    .finite()
    .min(-90, "Latitude must be between -90 and 90.")
    .max(90, "Latitude must be between -90 and 90."),
  longitude: z.coerce
    .number()
    .finite()
    .min(-180, "Longitude must be between -180 and 180.")
    .max(180, "Longitude must be between -180 and 180."),
  precision: z.enum(locationPrecisions).default("city"),
});

export const updatePersonInputSchema = z.object({
  personId: z.string().uuid(),
  displayName: trimmedText("Person name", 160),
  title: z.string().trim().max(160).optional().default(""),
  organization: z.string().trim().max(200).optional().default(""),
  tier: z.enum(personTiers),
  status: z.enum(personStatuses),
  notes: z.string().trim().max(4_000).optional().default(""),
});

export const addPersonIdentityInputSchema = z.object({
  personId: z.string().uuid(),
  type: z.enum(identityTypes),
  value: trimmedText("Identity", 320),
  makePrimary: z.boolean().default(false),
});

export const replacePersonLocationInputSchema = z.object({
  personId: z.string().uuid(),
  label: trimmedText("Location label", 160),
  latitude: z.coerce
    .number()
    .finite()
    .min(-90, "Latitude must be between -90 and 90.")
    .max(90, "Latitude must be between -90 and 90."),
  longitude: z.coerce
    .number()
    .finite()
    .min(-180, "Longitude must be between -180 and 180.")
    .max(180, "Longitude must be between -180 and 180."),
  precision: z.enum(locationPrecisions),
});

export type CreatePersonInput = z.input<typeof createPersonInputSchema>;
export type UpdatePersonInput = z.input<typeof updatePersonInputSchema>;
export type AddPersonIdentityInput = z.input<
  typeof addPersonIdentityInputSchema
>;
export type ReplacePersonLocationInput = z.input<
  typeof replacePersonLocationInputSchema
>;

export function normalizeIdentity(type: IdentityType, value: string): string {
  const trimmed = value.trim();

  switch (type) {
    case "work_email":
    case "personal_email":
    case "domain":
    case "username":
      return trimmed.toLocaleLowerCase("en-US");
    case "phone": {
      const hasInternationalPrefix = trimmed.startsWith("+");
      const digits = trimmed.replace(/\D/g, "");
      return hasInternationalPrefix ? `+${digits}` : digits;
    }
    case "other":
      return trimmed.replace(/\s+/g, " ").toLocaleLowerCase("en-US");
  }
}
