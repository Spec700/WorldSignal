import { createHash } from "node:crypto";

import { z } from "zod";

import { identityTypes, type IdentityType } from "@/features/people/domain";

export { identityTypes, normalizeIdentity } from "@/features/people/domain";
export const credentialKinds = [
  "password",
  "password_hash",
  "session_token",
  "session_cookie",
  "api_key",
  "other",
] as const;
export const managedCredentialKinds = [
  "password",
  "session_token",
  "session_cookie",
  "api_key",
  "other",
] as const;
export const credentialAssetStatuses = [
  "active",
  "rotating",
  "revoked",
  "retired",
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
export const communicationChannels = [
  "email",
  "phone",
  "chat",
  "in_person",
  "other",
] as const;
export const communicationStatuses = [
  "draft",
  "planned",
  "sent",
  "acknowledged",
  "failed",
] as const;
export const taskTypes = [
  "verify",
  "notify",
  "password_reset",
  "revoke_sessions",
  "enable_mfa",
  "check_reuse",
  "investigate_device",
  "other",
] as const;
export const taskStatuses = [
  "todo",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export type CredentialKind = (typeof credentialKinds)[number];
export type ManagedCredentialKind = (typeof managedCredentialKinds)[number];
export type ExposurePriority = (typeof priorities)[number];

const trimmedText = (label: string, maximum: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(maximum, `${label} must be ${maximum} characters or fewer.`);

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

export const createCredentialInputSchema = z.object({
  protecteeId: z.string().uuid(),
  identityId: z.union([z.string().uuid(), z.literal("")]).optional(),
  accountIdentifier: trimmedText("Account identifier", 320),
  service: trimmedText("Service", 200),
  serviceDomain: z.string().trim().max(253).optional().default(""),
  credentialKind: z.enum(managedCredentialKinds),
  credentialValue: z
    .string()
    .min(1, "Credential value is required.")
    .max(65_536),
  notes: z.string().trim().max(4_000).optional().default(""),
});

export const rotateCredentialInputSchema = z.object({
  credentialId: z.string().uuid(),
  credentialValue: z
    .string()
    .min(1, "The replacement credential value is required.")
    .max(65_536),
  notes: z.string().trim().max(4_000).optional().default(""),
});

export const changeCredentialStatusInputSchema = z.object({
  credentialId: z.string().uuid(),
  status: z.enum(["revoked", "retired"]),
  reason: trimmedText("Status rationale", 1_000),
});

export const matchExposureInputSchema = z.object({
  exposureId: z.string().uuid(),
  protecteeId: z.string().uuid(),
  identityId: z.string().uuid(),
  credentialId: z.union([z.string().uuid(), z.literal("")]).optional(),
  reason: trimmedText("Match rationale", 1_000),
});

export const createCaseCommunicationInputSchema = z.object({
  caseId: z.string().uuid(),
  channel: z.enum(communicationChannels),
  recipientLabel: trimmedText("Recipient", 200),
  subject: z.string().trim().max(320).optional().default(""),
  body: z.string().trim().max(10_000).optional().default(""),
  status: z.enum(["draft", "planned"]).default("draft"),
});

const optionalDateInput = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce.date().optional(),
);

export const updateCaseCoordinationInputSchema = z.object({
  caseId: z.string().uuid(),
  assigneeOperatorId: z
    .union([z.string().uuid(), z.literal("")])
    .optional()
    .default(""),
  priority: z.enum(priorities),
  dueAt: z.coerce.date(),
});

export const createCaseTaskInputSchema = z.object({
  caseId: z.string().uuid(),
  type: z.enum(taskTypes),
  title: trimmedText("Task title", 320),
  assigneeOperatorId: z
    .union([z.string().uuid(), z.literal("")])
    .optional()
    .default(""),
  dueAt: optionalDateInput,
  notes: z.string().trim().max(4_000).optional().default(""),
});

export const updateCaseTaskInputSchema = z.object({
  taskId: z.string().uuid(),
  assigneeOperatorId: z
    .union([z.string().uuid(), z.literal("")])
    .optional()
    .default(""),
  dueAt: optionalDateInput,
  notes: z.string().trim().max(4_000).optional().default(""),
});

export type CreateExposureInput = z.infer<typeof createExposureInputSchema>;
export type CreateCredentialInput = z.infer<typeof createCredentialInputSchema>;
export type RotateCredentialInput = z.infer<typeof rotateCredentialInputSchema>;
export type ChangeCredentialStatusInput = z.infer<
  typeof changeCredentialStatusInputSchema
>;
export type MatchExposureInput = z.infer<typeof matchExposureInputSchema>;
export type CreateCaseCommunicationInput = z.infer<
  typeof createCaseCommunicationInputSchema
>;
export type UpdateCaseCoordinationInput = z.infer<
  typeof updateCaseCoordinationInputSchema
>;
export type CreateCaseTaskInput = z.infer<typeof createCaseTaskInputSchema>;
export type UpdateCaseTaskInput = z.infer<typeof updateCaseTaskInputSchema>;

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
