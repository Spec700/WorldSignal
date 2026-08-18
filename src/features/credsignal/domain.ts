import { createHash } from "node:crypto";

import { z } from "zod";

export const identityTypes = [
  "work_email",
  "personal_email",
  "username",
  "phone",
  "domain",
  "other",
] as const;
export const protecteeTiers = ["standard", "high", "critical"] as const;
export const credentialKinds = [
  "password",
  "password_hash",
  "session_token",
  "session_cookie",
  "api_key",
  "other",
] as const;
export const exposureSourceTypes = [
  "breach",
  "infostealer",
  "phishing",
  "combolist",
  "paste",
  "internal_report",
  "other",
] as const;
export const priorities = ["low", "medium", "high", "critical"] as const;
export const confidences = ["low", "medium", "high", "confirmed"] as const;

export type IdentityType = (typeof identityTypes)[number];
export type CredentialKind = (typeof credentialKinds)[number];
export type ExposurePriority = (typeof priorities)[number];

const trimmedText = (label: string, maximum: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(maximum, `${label} must be ${maximum} characters or fewer.`);

export const createProtecteeInputSchema = z.object({
  displayName: trimmedText("Protectee name", 160),
  title: z.string().trim().max(160).optional().default(""),
  organization: z.string().trim().max(200).optional().default(""),
  tier: z.enum(protecteeTiers).default("standard"),
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
});

export const createExposureInputSchema = z
  .object({
    protecteeId: z.union([z.string().uuid(), z.literal("")]).optional(),
    identityType: z.enum(identityTypes),
    identityValue: trimmedText("Exposed identity", 320),
    credentialKind: z.enum(credentialKinds),
    credentialValue: z.string().max(65_536).optional().default(""),
    service: z.string().trim().max(200).optional().default(""),
    serviceDomain: z.string().trim().max(253).optional().default(""),
    sourceType: z.enum(exposureSourceTypes),
    sourceName: trimmedText("Source name", 200),
    sourceRecordId: z.string().trim().max(320).optional().default(""),
    observedAt: z.coerce.date(),
    severity: z.enum(priorities).optional(),
    confidence: z.enum(confidences).default("medium"),
    notes: z.string().trim().max(4_000).optional().default(""),
  })
  .superRefine((value, context) => {
    if (
      value.credentialKind !== "other" &&
      value.credentialValue.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "Credential value is required for this credential type.",
        path: ["credentialValue"],
      });
    }
  });

export const matchExposureInputSchema = z.object({
  exposureId: z.string().uuid(),
  protecteeId: z.string().uuid(),
  identityId: z.string().uuid(),
  reason: trimmedText("Match rationale", 1_000),
});

export type CreateProtecteeInput = z.infer<typeof createProtecteeInputSchema>;
export type CreateExposureInput = z.infer<typeof createExposureInputSchema>;
export type MatchExposureInput = z.infer<typeof matchExposureInputSchema>;

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

export function classifyCredentialSeverity(
  credentialKind: CredentialKind,
): ExposurePriority {
  switch (credentialKind) {
    case "session_token":
    case "session_cookie":
    case "api_key":
      return "critical";
    case "password":
      return "high";
    case "password_hash":
      return "medium";
    case "other":
      return "low";
  }
}

interface ExposureDedupeFields {
  identityType: IdentityType;
  normalizedIdentity: string;
  credentialKind: CredentialKind;
  credentialFingerprint?: string;
  service?: string;
  serviceDomain?: string;
  sourceType: (typeof exposureSourceTypes)[number];
  sourceName: string;
  sourceRecordId?: string;
  observedAt: Date;
}

export function buildExposureDedupeKey(fields: ExposureDedupeFields): string {
  const canonical = JSON.stringify({
    identityType: fields.identityType,
    normalizedIdentity: fields.normalizedIdentity,
    credentialKind: fields.credentialKind,
    credentialFingerprint: fields.credentialFingerprint ?? null,
    service: fields.service?.trim().toLocaleLowerCase("en-US") || null,
    serviceDomain:
      fields.serviceDomain?.trim().toLocaleLowerCase("en-US") || null,
    sourceType: fields.sourceType,
    sourceName: fields.sourceName.trim().toLocaleLowerCase("en-US"),
    sourceRecordId: fields.sourceRecordId?.trim() || null,
    observedAt: fields.observedAt.toISOString(),
  });

  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
