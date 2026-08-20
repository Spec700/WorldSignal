import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import {
  buildExposureDedupeKey,
  changeCredentialStatusInputSchema,
  classifyCredentialSeverity,
  communicationStatuses,
  createCaseCommunicationInputSchema,
  createCaseTaskInputSchema,
  createCredentialInputSchema,
  createExposureInputSchema,
  matchExposureInputSchema,
  normalizeIdentity,
  rotateCredentialInputSchema,
  taskStatuses,
  updateCaseCoordinationInputSchema,
  updateCaseTaskInputSchema,
  type ChangeCredentialStatusInput,
  type CreateCaseCommunicationInput,
  type CreateCaseTaskInput,
  type CreateCredentialInput,
  type CreateExposureInput,
  type ExposurePriority,
  type MatchExposureInput,
  type RotateCredentialInput,
  type UpdateCaseCoordinationInput,
  type UpdateCaseTaskInput,
} from "@/features/credsignal/domain";
import { getCredentialCryptoConfig } from "@/lib/credentials/config";
import {
  decryptSecret,
  encryptSecret,
  fingerprintSecret,
} from "@/lib/credentials/secret-crypto";
import { getDatabase } from "@/lib/db/client";
import {
  activityLog,
  caseExposures,
  caseTasks,
  communications,
  credentialAssets,
  credentialExposures,
  credentialVersions,
  exposureMatches,
  exposureSources,
  operators,
  protecteeIdentities,
  protectees,
  responseCases,
  workspaces,
} from "@/lib/db/schema";

export class CredSignalWorkflowError extends Error {}
export class CredSignalConflictError extends CredSignalWorkflowError {}
export class CredSignalNotFoundError extends CredSignalWorkflowError {}

type CredSignalDatabase = ReturnType<typeof getDatabase>;
type CredSignalTransaction = Parameters<
  Parameters<CredSignalDatabase["transaction"]>[0]
>[0];

const workspaceSlug = () => process.env.CREDSIGNAL_WORKSPACE_SLUG ?? "local";

async function getLocalWorkspace() {
  const database = getDatabase();
  const [workspace] = await database
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, workspaceSlug()))
    .limit(1);

  if (!workspace) {
    throw new CredSignalNotFoundError(
      "CredSignal has not been initialized. Run the database seed command first.",
    );
  }

  return { database, workspace };
}

async function resolveActor(workspaceId: string, requestedOperatorId?: string) {
  if (!requestedOperatorId) {
    return undefined;
  }

  const database = getDatabase();
  const [operator] = await database
    .select()
    .from(operators)
    .where(
      and(
        eq(operators.id, requestedOperatorId),
        eq(operators.workspaceId, workspaceId),
        eq(operators.status, "active"),
      ),
    )
    .limit(1);

  if (!operator) {
    throw new CredSignalNotFoundError(
      "The selected operator is not active in this workspace.",
    );
  }

  return operator;
}

function caseDueAt(priority: ExposurePriority, now: Date): Date {
  const dueInHours: Record<ExposurePriority, number> = {
    critical: 4,
    high: 24,
    medium: 72,
    low: 168,
  };

  return new Date(now.getTime() + dueInHours[priority] * 60 * 60 * 1_000);
}

function defaultTasks(
  credentialKind: CreateExposureInput["credentialKind"],
  dueAt: Date,
) {
  const tasks = {
    session_token: [
      { type: "revoke_sessions" as const, title: "Revoke active sessions" },
      { type: "password_reset" as const, title: "Rotate account password" },
    ],
    session_cookie: [
      { type: "revoke_sessions" as const, title: "Revoke active sessions" },
      { type: "password_reset" as const, title: "Rotate account password" },
    ],
    api_key: [
      { type: "other" as const, title: "Rotate exposed API key" },
      { type: "verify" as const, title: "Verify old key is disabled" },
    ],
    password: [
      { type: "password_reset" as const, title: "Reset exposed password" },
      { type: "check_reuse" as const, title: "Check password reuse" },
    ],
    password_hash: [
      { type: "verify" as const, title: "Verify whether the hash is active" },
      { type: "check_reuse" as const, title: "Check password reuse" },
    ],
    other: [
      { type: "verify" as const, title: "Verify the exposed credential" },
    ],
  }[credentialKind];

  return tasks.map((task) => ({ ...task, dueAt }));
}

interface OpenResponseCaseInput {
  workspaceId: string;
  protecteeId: string;
  protecteeDisplayName: string;
  exposureId: string;
  credentialKind: CreateExposureInput["credentialKind"];
  service: string | null;
  serviceDomain: string | null;
  severity: ExposurePriority;
  actorOperatorId?: string;
  now: Date;
}

async function openResponseCase(
  transaction: CredSignalTransaction,
  input: OpenResponseCaseInput,
) {
  const dueAt = caseDueAt(input.severity, input.now);
  const [responseCase] = await transaction
    .insert(responseCases)
    .values({
      workspaceId: input.workspaceId,
      protecteeId: input.protecteeId,
      title: `${input.service || input.serviceDomain || "Credential"} exposure`,
      status: "open",
      priority: input.severity,
      assigneeOperatorId: input.actorOperatorId,
      dueAt,
    })
    .returning();

  await transaction.insert(caseExposures).values({
    caseId: responseCase.id,
    exposureId: input.exposureId,
    attachedByOperatorId: input.actorOperatorId,
  });
  await transaction.insert(caseTasks).values(
    defaultTasks(input.credentialKind, dueAt).map((task) => ({
      caseId: responseCase.id,
      type: task.type,
      title: task.title,
      assigneeOperatorId: input.actorOperatorId,
      dueAt: task.dueAt,
    })),
  );
  await transaction.insert(activityLog).values({
    workspaceId: input.workspaceId,
    actorOperatorId: input.actorOperatorId,
    action: "case.created",
    entityType: "response_case",
    entityId: responseCase.id,
    summary: `${input.severity} response case opened for ${input.protecteeDisplayName}.`,
    metadata: { exposureId: input.exposureId, priority: input.severity },
  });

  return responseCase;
}

function credentialKindMatchesExposure(
  managedKind: string,
  exposureKind: string,
) {
  return (
    managedKind === exposureKind ||
    (managedKind === "password" && exposureKind === "password_hash")
  );
}

async function findCredentialForExposure(
  workspaceId: string,
  protecteeId: string,
  identityId: string,
  input: CreateExposureInput,
) {
  const database = getDatabase();
  const candidates = await database
    .select()
    .from(credentialAssets)
    .where(
      and(
        eq(credentialAssets.workspaceId, workspaceId),
        eq(credentialAssets.protecteeId, protecteeId),
        inArray(credentialAssets.status, ["active", "rotating"]),
      ),
    );
  const serviceDomain = input.serviceDomain.trim().toLocaleLowerCase("en-US");
  const service = input.service.trim().toLocaleLowerCase("en-US");

  const matches = candidates.filter((candidate) => {
    if (
      candidate.identityId !== identityId ||
      !credentialKindMatchesExposure(
        candidate.credentialKind,
        input.credentialKind,
      )
    ) {
      return false;
    }
    if (serviceDomain) {
      return (
        candidate.serviceDomain?.toLocaleLowerCase("en-US") === serviceDomain
      );
    }
    if (service) {
      return candidate.service.toLocaleLowerCase("en-US") === service;
    }
    return true;
  });

  return matches.length === 1 ? matches[0] : undefined;
}

export async function createCredential(
  rawInput: CreateCredentialInput,
  actorOperatorId?: string,
) {
  const input = createCredentialInputSchema.parse(rawInput);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const [protectee] = await database
    .select({ id: protectees.id, displayName: protectees.displayName })
    .from(protectees)
    .where(
      and(
        eq(protectees.id, input.protecteeId),
        eq(protectees.workspaceId, workspace.id),
        eq(protectees.status, "active"),
      ),
    )
    .limit(1);

  if (!protectee) {
    throw new CredSignalNotFoundError(
      "The selected person is not active in this workspace.",
    );
  }
  if (input.identityId) {
    const [identity] = await database
      .select({ id: protecteeIdentities.id })
      .from(protecteeIdentities)
      .where(
        and(
          eq(protecteeIdentities.id, input.identityId),
          eq(protecteeIdentities.workspaceId, workspace.id),
          eq(protecteeIdentities.protecteeId, protectee.id),
          eq(protecteeIdentities.isActive, true),
        ),
      )
      .limit(1);
    if (!identity) {
      throw new CredSignalNotFoundError(
        "The selected account identity is not active for this person.",
      );
    }
  }

  const cryptoConfig = getCredentialCryptoConfig();
  const encrypted = encryptSecret(
    input.credentialValue,
    cryptoConfig.dataKey,
    cryptoConfig.keyVersion,
  );
  const fingerprint = fingerprintSecret(
    input.credentialValue,
    cryptoConfig.dataKey,
  );
  const now = new Date();

  return database.transaction(async (transaction) => {
    const [credential] = await transaction
      .insert(credentialAssets)
      .values({
        workspaceId: workspace.id,
        protecteeId: protectee.id,
        identityId: input.identityId || null,
        accountIdentifier: input.accountIdentifier,
        service: input.service,
        serviceDomain: input.serviceDomain || null,
        credentialKind: input.credentialKind,
        status: "active",
        notes: input.notes || null,
        createdByOperatorId: actor?.id,
      })
      .onConflictDoNothing({
        target: [
          credentialAssets.workspaceId,
          credentialAssets.protecteeId,
          credentialAssets.accountIdentifier,
          credentialAssets.service,
          credentialAssets.credentialKind,
        ],
      })
      .returning();

    if (!credential) {
      throw new CredSignalConflictError(
        "This person already has that credential recorded for the service.",
      );
    }

    const [version] = await transaction
      .insert(credentialVersions)
      .values({
        credentialId: credential.id,
        version: 1,
        credentialCiphertext: encrypted.ciphertext,
        credentialIv: encrypted.iv,
        credentialAuthTag: encrypted.authTag,
        credentialKeyVersion: encrypted.keyVersion,
        credentialFingerprint: fingerprint,
        credentialLength: input.credentialValue.length,
        status: "active",
        activatedAt: now,
        createdByOperatorId: actor?.id,
      })
      .returning({ id: credentialVersions.id });

    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: "managed_credential.created",
      entityType: "credential_asset",
      entityId: credential.id,
      summary: `${input.credentialKind.replaceAll("_", " ")} credential added for ${protectee.displayName}.`,
      metadata: {
        service: input.service,
        versionId: version.id,
      },
    });

    return { credentialId: credential.id, versionId: version.id };
  });
}

export async function rotateCredential(
  rawInput: RotateCredentialInput,
  actorOperatorId?: string,
) {
  const input = rotateCredentialInputSchema.parse(rawInput);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const cryptoConfig = getCredentialCryptoConfig();
  const encrypted = encryptSecret(
    input.credentialValue,
    cryptoConfig.dataKey,
    cryptoConfig.keyVersion,
  );
  const fingerprint = fingerprintSecret(
    input.credentialValue,
    cryptoConfig.dataKey,
  );
  const now = new Date();

  return database.transaction(async (transaction) => {
    const [credential] = await transaction
      .select()
      .from(credentialAssets)
      .where(
        and(
          eq(credentialAssets.id, input.credentialId),
          eq(credentialAssets.workspaceId, workspace.id),
        ),
      )
      .limit(1);
    if (!credential) {
      throw new CredSignalNotFoundError(
        "The managed credential no longer exists.",
      );
    }
    if (credential.status === "retired") {
      throw new CredSignalConflictError(
        "Retired credentials cannot be rotated.",
      );
    }

    const versions = await transaction
      .select()
      .from(credentialVersions)
      .where(eq(credentialVersions.credentialId, credential.id))
      .orderBy(desc(credentialVersions.version));
    const activeVersion = versions.find(
      (version) => version.status === "active",
    );
    if (activeVersion?.credentialFingerprint === fingerprint) {
      throw new CredSignalConflictError(
        "The replacement value must differ from the active credential.",
      );
    }

    await transaction
      .update(credentialAssets)
      .set({ status: "rotating", updatedAt: now })
      .where(eq(credentialAssets.id, credential.id));
    if (activeVersion) {
      await transaction
        .update(credentialVersions)
        .set({ status: "superseded", retiredAt: now, updatedAt: now })
        .where(eq(credentialVersions.id, activeVersion.id));
    }
    const nextVersion = (versions[0]?.version ?? 0) + 1;
    const [version] = await transaction
      .insert(credentialVersions)
      .values({
        credentialId: credential.id,
        version: nextVersion,
        credentialCiphertext: encrypted.ciphertext,
        credentialIv: encrypted.iv,
        credentialAuthTag: encrypted.authTag,
        credentialKeyVersion: encrypted.keyVersion,
        credentialFingerprint: fingerprint,
        credentialLength: input.credentialValue.length,
        status: "active",
        activatedAt: now,
        createdByOperatorId: actor?.id,
      })
      .returning({ id: credentialVersions.id });
    await transaction
      .update(credentialAssets)
      .set({ status: "active", updatedAt: now })
      .where(eq(credentialAssets.id, credential.id));
    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: "managed_credential.rotated",
      entityType: "credential_asset",
      entityId: credential.id,
      summary: `${credential.service} credential rotated to version ${nextVersion}.`,
      metadata: { notes: input.notes || undefined, versionId: version.id },
    });

    return { credentialId: credential.id, versionId: version.id };
  });
}

export async function changeCredentialStatus(
  rawInput: ChangeCredentialStatusInput,
  actorOperatorId?: string,
) {
  const input = changeCredentialStatusInputSchema.parse(rawInput);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const now = new Date();

  return database.transaction(async (transaction) => {
    const [credential] = await transaction
      .select()
      .from(credentialAssets)
      .where(
        and(
          eq(credentialAssets.id, input.credentialId),
          eq(credentialAssets.workspaceId, workspace.id),
        ),
      )
      .limit(1);
    if (!credential) {
      throw new CredSignalNotFoundError(
        "The managed credential no longer exists.",
      );
    }
    if (credential.status === input.status) {
      throw new CredSignalConflictError(
        `This credential is already ${input.status}.`,
      );
    }
    if (credential.status === "retired") {
      throw new CredSignalConflictError(
        "Retired credentials cannot change operational status.",
      );
    }

    await transaction
      .update(credentialVersions)
      .set({ status: "revoked", retiredAt: now, updatedAt: now })
      .where(
        and(
          eq(credentialVersions.credentialId, credential.id),
          eq(credentialVersions.status, "active"),
        ),
      );
    await transaction
      .update(credentialAssets)
      .set({ status: input.status, updatedAt: now })
      .where(eq(credentialAssets.id, credential.id));
    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: `managed_credential.${input.status}`,
      entityType: "credential_asset",
      entityId: credential.id,
      summary: `${credential.service} credential marked ${input.status}.`,
      metadata: { reason: input.reason },
    });

    return { credentialId: credential.id };
  });
}

export async function createExposure(
  rawInput: CreateExposureInput,
  actorOperatorId?: string,
) {
  const input = createExposureInputSchema.parse(rawInput);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const normalizedIdentity = normalizeIdentity(
    input.identityType,
    input.identityValue,
  );
  const [matchedIdentity] = await database
    .select({
      id: protecteeIdentities.id,
      protecteeId: protecteeIdentities.protecteeId,
    })
    .from(protecteeIdentities)
    .innerJoin(protectees, eq(protecteeIdentities.protecteeId, protectees.id))
    .where(
      and(
        eq(protecteeIdentities.workspaceId, workspace.id),
        eq(protecteeIdentities.type, input.identityType),
        eq(protecteeIdentities.normalizedValue, normalizedIdentity),
        eq(protecteeIdentities.isActive, true),
        eq(protectees.status, "active"),
      ),
    )
    .limit(1);

  if (
    input.protecteeId &&
    (!matchedIdentity || matchedIdentity.protecteeId !== input.protecteeId)
  ) {
    throw new CredSignalConflictError(
      "The exposed identity does not belong to the selected protectee.",
    );
  }
  const matchedCredential = matchedIdentity
    ? await findCredentialForExposure(
        workspace.id,
        matchedIdentity.protecteeId,
        matchedIdentity.id,
        input,
      )
    : undefined;

  const cryptoConfig = getCredentialCryptoConfig();
  const encrypted = input.credentialValue
    ? encryptSecret(
        input.credentialValue,
        cryptoConfig.dataKey,
        cryptoConfig.keyVersion,
      )
    : undefined;
  const fingerprint = input.credentialValue
    ? fingerprintSecret(input.credentialValue, cryptoConfig.dataKey)
    : undefined;
  const severity =
    input.severity ?? classifyCredentialSeverity(input.credentialKind);
  const dedupeKey = buildExposureDedupeKey({
    identityType: input.identityType,
    normalizedIdentity,
    credentialKind: input.credentialKind,
    credentialFingerprint: fingerprint,
    service: input.service,
    serviceDomain: input.serviceDomain,
    sourceType: input.sourceType,
    sourceName: input.sourceName,
    sourceRecordId: input.sourceRecordId,
    observedAt: input.observedAt,
  });
  const now = new Date();

  return database.transaction(async (transaction) => {
    const [source] = await transaction
      .insert(exposureSources)
      .values({
        workspaceId: workspace.id,
        type: input.sourceType,
        name: input.sourceName,
        sourceRecordId: input.sourceRecordId || null,
        observedAt: input.observedAt,
        confidence: input.confidence,
        createdByOperatorId: actor?.id,
      })
      .returning();
    const [exposure] = await transaction
      .insert(credentialExposures)
      .values({
        workspaceId: workspace.id,
        sourceId: source.id,
        exposedIdentityType: input.identityType,
        exposedIdentityDisplay: input.identityValue,
        exposedIdentityNormalized: normalizedIdentity,
        service: input.service || null,
        serviceDomain: input.serviceDomain || null,
        credentialKind: input.credentialKind,
        credentialCiphertext: encrypted?.ciphertext,
        credentialIv: encrypted?.iv,
        credentialAuthTag: encrypted?.authTag,
        credentialKeyVersion: encrypted?.keyVersion,
        credentialFingerprint: fingerprint,
        credentialLength: input.credentialValue.length || null,
        dedupeKey,
        observedAt: input.observedAt,
        severity,
        confidence: input.confidence,
        verification: matchedIdentity ? "confirmed" : "unverified",
        status: matchedIdentity ? "in_case" : "new",
        notes: input.notes || null,
        createdByOperatorId: actor?.id,
      })
      .onConflictDoNothing({
        target: [
          credentialExposures.workspaceId,
          credentialExposures.dedupeKey,
        ],
      })
      .returning();

    if (!exposure) {
      throw new CredSignalConflictError(
        "This exposure is already recorded in the workspace.",
      );
    }

    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: "exposure.created",
      entityType: "credential_exposure",
      entityId: exposure.id,
      summary: `${input.credentialKind.replaceAll("_", " ")} exposure recorded for ${input.identityValue}.`,
      metadata: {
        confidence: input.confidence,
        matched: Boolean(matchedIdentity),
        severity,
        sourceType: input.sourceType,
      },
    });

    if (!matchedIdentity) {
      return {
        exposureId: exposure.id,
        caseId: undefined,
        matchedProtecteeId: undefined,
      };
    }

    await transaction.insert(exposureMatches).values({
      exposureId: exposure.id,
      protecteeId: matchedIdentity.protecteeId,
      identityId: matchedIdentity.id,
      credentialId: matchedCredential?.id,
      method: "exact",
      confidence: "confirmed",
      confirmedByOperatorId: actor?.id,
      confirmedAt: now,
    });
    const [protectee] = await transaction
      .select({ displayName: protectees.displayName })
      .from(protectees)
      .where(eq(protectees.id, matchedIdentity.protecteeId))
      .limit(1);
    const responseCase = await openResponseCase(transaction, {
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      credentialKind: exposure.credentialKind,
      exposureId: exposure.id,
      now,
      protecteeDisplayName: protectee?.displayName ?? input.identityValue,
      protecteeId: matchedIdentity.protecteeId,
      service: exposure.service,
      serviceDomain: exposure.serviceDomain,
      severity,
    });

    return {
      exposureId: exposure.id,
      caseId: responseCase.id,
      matchedProtecteeId: matchedIdentity.protecteeId,
    };
  });
}

export async function manuallyMatchExposure(
  rawInput: MatchExposureInput,
  actorOperatorId?: string,
) {
  const input = matchExposureInputSchema.parse(rawInput);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const now = new Date();

  return database.transaction(async (transaction) => {
    const [exposure] = await transaction
      .select({
        id: credentialExposures.id,
        credentialKind: credentialExposures.credentialKind,
        service: credentialExposures.service,
        serviceDomain: credentialExposures.serviceDomain,
        severity: credentialExposures.severity,
        status: credentialExposures.status,
      })
      .from(credentialExposures)
      .where(
        and(
          eq(credentialExposures.id, input.exposureId),
          eq(credentialExposures.workspaceId, workspace.id),
        ),
      )
      .limit(1);

    if (!exposure) {
      throw new CredSignalNotFoundError(
        "The unmatched exposure no longer exists.",
      );
    }
    if (exposure.status !== "new" && exposure.status !== "triaged") {
      throw new CredSignalConflictError(
        "This exposure has already entered a response workflow.",
      );
    }

    const [existingMatch] = await transaction
      .select({ id: exposureMatches.id })
      .from(exposureMatches)
      .where(eq(exposureMatches.exposureId, exposure.id))
      .limit(1);
    if (existingMatch) {
      throw new CredSignalConflictError(
        "This exposure is already assigned to a protectee.",
      );
    }

    const [approvedIdentity] = await transaction
      .select({
        id: protecteeIdentities.id,
        displayValue: protecteeIdentities.displayValue,
        protecteeId: protectees.id,
        protecteeDisplayName: protectees.displayName,
      })
      .from(protecteeIdentities)
      .innerJoin(protectees, eq(protecteeIdentities.protecteeId, protectees.id))
      .where(
        and(
          eq(protecteeIdentities.id, input.identityId),
          eq(protecteeIdentities.workspaceId, workspace.id),
          eq(protecteeIdentities.protecteeId, input.protecteeId),
          eq(protecteeIdentities.isActive, true),
          eq(protectees.status, "active"),
        ),
      )
      .limit(1);

    if (!approvedIdentity) {
      throw new CredSignalNotFoundError(
        "The selected approved identity is not active for this protectee.",
      );
    }

    let matchedCredentialId: string | undefined;
    if (input.credentialId) {
      const [managedCredential] = await transaction
        .select({
          id: credentialAssets.id,
          credentialKind: credentialAssets.credentialKind,
        })
        .from(credentialAssets)
        .where(
          and(
            eq(credentialAssets.id, input.credentialId),
            eq(credentialAssets.workspaceId, workspace.id),
            eq(credentialAssets.protecteeId, approvedIdentity.protecteeId),
          ),
        )
        .limit(1);
      if (!managedCredential) {
        throw new CredSignalNotFoundError(
          "The selected credential does not belong to this person.",
        );
      }
      if (
        !credentialKindMatchesExposure(
          managedCredential.credentialKind,
          exposure.credentialKind,
        )
      ) {
        throw new CredSignalConflictError(
          "The selected credential type does not match the exposure evidence.",
        );
      }
      matchedCredentialId = managedCredential.id;
    }

    const [match] = await transaction
      .insert(exposureMatches)
      .values({
        exposureId: exposure.id,
        protecteeId: approvedIdentity.protecteeId,
        identityId: approvedIdentity.id,
        credentialId: matchedCredentialId,
        method: "manual",
        confidence: "confirmed",
        confirmedByOperatorId: actor?.id,
        confirmedAt: now,
      })
      .onConflictDoNothing({ target: exposureMatches.exposureId })
      .returning({ id: exposureMatches.id });

    if (!match) {
      throw new CredSignalConflictError(
        "Another analyst assigned this exposure before this decision was saved.",
      );
    }

    await transaction
      .update(credentialExposures)
      .set({
        status: "in_case",
        verification: "confirmed",
        updatedAt: now,
      })
      .where(eq(credentialExposures.id, exposure.id));
    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: "exposure.manually_matched",
      entityType: "credential_exposure",
      entityId: exposure.id,
      summary: `Exposure manually assigned to ${approvedIdentity.protecteeDisplayName}.`,
      metadata: {
        identityId: approvedIdentity.id,
        identityValue: approvedIdentity.displayValue,
        protecteeId: approvedIdentity.protecteeId,
        credentialId: matchedCredentialId,
        reason: input.reason,
      },
    });

    const responseCase = await openResponseCase(transaction, {
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      credentialKind: exposure.credentialKind,
      exposureId: exposure.id,
      now,
      protecteeDisplayName: approvedIdentity.protecteeDisplayName,
      protecteeId: approvedIdentity.protecteeId,
      service: exposure.service,
      serviceDomain: exposure.serviceDomain,
      severity: exposure.severity,
    });

    return {
      caseId: responseCase.id,
      exposureId: exposure.id,
      protecteeId: approvedIdentity.protecteeId,
    };
  });
}

function requireActiveCase(status: CaseStatus) {
  if (status === "closed" || status === "dismissed") {
    throw new CredSignalWorkflowError(
      "Reopen the case before changing its coordination details.",
    );
  }
}

async function requireCaseTaskForUpdate(
  transaction: CredSignalTransaction,
  workspaceId: string,
  taskId: string,
) {
  const [taskReference] = await transaction
    .select({ caseId: caseTasks.caseId })
    .from(caseTasks)
    .innerJoin(responseCases, eq(caseTasks.caseId, responseCases.id))
    .where(
      and(eq(caseTasks.id, taskId), eq(responseCases.workspaceId, workspaceId)),
    )
    .limit(1);

  if (!taskReference) {
    throw new CredSignalNotFoundError("The remediation task no longer exists.");
  }

  const [responseCase] = await transaction
    .select({ id: responseCases.id, status: responseCases.status })
    .from(responseCases)
    .where(
      and(
        eq(responseCases.id, taskReference.caseId),
        eq(responseCases.workspaceId, workspaceId),
      ),
    )
    .limit(1)
    .for("update");
  const [task] = await transaction
    .select({
      id: caseTasks.id,
      caseId: caseTasks.caseId,
      status: caseTasks.status,
      title: caseTasks.title,
      assigneeOperatorId: caseTasks.assigneeOperatorId,
      dueAt: caseTasks.dueAt,
    })
    .from(caseTasks)
    .where(
      and(eq(caseTasks.id, taskId), eq(caseTasks.caseId, taskReference.caseId)),
    )
    .limit(1)
    .for("update");

  if (!responseCase || !task) {
    throw new CredSignalNotFoundError("The remediation task no longer exists.");
  }

  return { caseStatus: responseCase.status, task };
}

export async function updateCaseCoordination(
  rawInput: UpdateCaseCoordinationInput,
  actorOperatorId?: string,
) {
  const input = updateCaseCoordinationInputSchema.parse(rawInput);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const assignee = await resolveActor(
    workspace.id,
    input.assigneeOperatorId || undefined,
  );

  return database.transaction(async (transaction) => {
    const [responseCase] = await transaction
      .select()
      .from(responseCases)
      .where(
        and(
          eq(responseCases.id, input.caseId),
          eq(responseCases.workspaceId, workspace.id),
        ),
      )
      .limit(1)
      .for("update");

    if (!responseCase) {
      throw new CredSignalNotFoundError("The response case no longer exists.");
    }
    requireActiveCase(responseCase.status);

    await transaction
      .update(responseCases)
      .set({
        assigneeOperatorId: assignee?.id ?? null,
        priority: input.priority,
        dueAt: input.dueAt,
        updatedAt: new Date(),
      })
      .where(eq(responseCases.id, responseCase.id));
    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: "case.coordination_updated",
      entityType: "response_case",
      entityId: responseCase.id,
      summary: `Case ownership and response targets updated for ${responseCase.title}.`,
      metadata: {
        assigneeOperatorId: assignee?.id ?? null,
        dueAt: input.dueAt.toISOString(),
        previousAssigneeOperatorId: responseCase.assigneeOperatorId,
        previousDueAt: responseCase.dueAt?.toISOString() ?? null,
        previousPriority: responseCase.priority,
        priority: input.priority,
      },
    });

    return { caseId: responseCase.id };
  });
}

export async function createCaseTask(
  rawInput: CreateCaseTaskInput,
  actorOperatorId?: string,
) {
  const input = createCaseTaskInputSchema.parse(rawInput);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const assignee = await resolveActor(
    workspace.id,
    input.assigneeOperatorId || undefined,
  );

  return database.transaction(async (transaction) => {
    const [responseCase] = await transaction
      .select({
        id: responseCases.id,
        dueAt: responseCases.dueAt,
        status: responseCases.status,
        title: responseCases.title,
      })
      .from(responseCases)
      .where(
        and(
          eq(responseCases.id, input.caseId),
          eq(responseCases.workspaceId, workspace.id),
        ),
      )
      .limit(1)
      .for("update");

    if (!responseCase) {
      throw new CredSignalNotFoundError("The response case no longer exists.");
    }
    requireActiveCase(responseCase.status);

    const [task] = await transaction
      .insert(caseTasks)
      .values({
        caseId: responseCase.id,
        type: input.type,
        title: input.title,
        assigneeOperatorId: assignee?.id,
        dueAt: input.dueAt ?? responseCase.dueAt,
        notes: input.notes || null,
      })
      .returning({ id: caseTasks.id });
    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: "task.created",
      entityType: "case_task",
      entityId: task.id,
      summary: `${input.title} added to ${responseCase.title}.`,
      metadata: {
        assigneeOperatorId: assignee?.id ?? null,
        caseId: responseCase.id,
        dueAt: (input.dueAt ?? responseCase.dueAt)?.toISOString() ?? null,
        type: input.type,
      },
    });

    return { taskId: task.id, caseId: responseCase.id };
  });
}

export async function updateCaseTask(
  rawInput: UpdateCaseTaskInput,
  actorOperatorId?: string,
) {
  const input = updateCaseTaskInputSchema.parse(rawInput);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const assignee = await resolveActor(
    workspace.id,
    input.assigneeOperatorId || undefined,
  );

  return database.transaction(async (transaction) => {
    const { caseStatus, task } = await requireCaseTaskForUpdate(
      transaction,
      workspace.id,
      input.taskId,
    );
    requireActiveCase(caseStatus);

    await transaction
      .update(caseTasks)
      .set({
        assigneeOperatorId: assignee?.id ?? null,
        dueAt: input.dueAt ?? null,
        notes: input.notes || null,
        updatedAt: new Date(),
      })
      .where(eq(caseTasks.id, task.id));
    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: "task.coordination_updated",
      entityType: "case_task",
      entityId: task.id,
      summary: `Ownership and response target updated for ${task.title}.`,
      metadata: {
        assigneeOperatorId: assignee?.id ?? null,
        caseId: task.caseId,
        dueAt: input.dueAt?.toISOString() ?? null,
        previousAssigneeOperatorId: task.assigneeOperatorId,
        previousDueAt: task.dueAt?.toISOString() ?? null,
      },
    });

    return { taskId: task.id, caseId: task.caseId };
  });
}

const caseStatusSchema = z.enum([
  "open",
  "investigating",
  "notifying",
  "remediating",
  "monitoring",
  "closed",
  "dismissed",
]);
type CaseStatus = z.infer<typeof caseStatusSchema>;

const allowedCaseTransitions: Record<CaseStatus, CaseStatus[]> = {
  open: ["investigating", "dismissed"],
  investigating: ["notifying", "remediating", "monitoring", "dismissed"],
  notifying: ["remediating", "monitoring", "dismissed"],
  remediating: ["monitoring", "closed", "dismissed"],
  monitoring: ["remediating", "closed", "dismissed"],
  closed: ["investigating"],
  dismissed: ["investigating"],
};

export async function transitionCase(
  caseId: string,
  nextStatus: CaseStatus,
  resolution: string | undefined,
  actorOperatorId?: string,
) {
  const parsedCaseId = z.string().uuid().parse(caseId);
  const parsedStatus = caseStatusSchema.parse(nextStatus);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const trimmedResolution = resolution?.trim();

  return database.transaction(async (transaction) => {
    const [responseCase] = await transaction
      .select()
      .from(responseCases)
      .where(
        and(
          eq(responseCases.id, parsedCaseId),
          eq(responseCases.workspaceId, workspace.id),
        ),
      )
      .limit(1)
      .for("update");

    if (!responseCase) {
      throw new CredSignalNotFoundError("The response case no longer exists.");
    }
    if (responseCase.status === parsedStatus) {
      return { caseId: responseCase.id };
    }
    if (!allowedCaseTransitions[responseCase.status].includes(parsedStatus)) {
      throw new CredSignalWorkflowError(
        `A ${responseCase.status} case cannot move directly to ${parsedStatus}.`,
      );
    }
    if (
      (parsedStatus === "closed" || parsedStatus === "dismissed") &&
      !trimmedResolution
    ) {
      throw new CredSignalWorkflowError(
        "A resolution is required before closing or dismissing a case.",
      );
    }

    const taskRows = await transaction
      .select({ id: caseTasks.id, status: caseTasks.status })
      .from(caseTasks)
      .where(eq(caseTasks.caseId, responseCase.id));
    const activeTasks = taskRows.filter(
      (task) => task.status !== "completed" && task.status !== "cancelled",
    );
    if (parsedStatus === "closed" && activeTasks.length > 0) {
      throw new CredSignalWorkflowError(
        `Complete or cancel ${activeTasks.length === 1 ? "the remaining task" : `all ${activeTasks.length} remaining tasks`} before closing this case.`,
      );
    }

    const now = new Date();
    await transaction
      .update(responseCases)
      .set({
        status: parsedStatus,
        resolution: trimmedResolution || null,
        closedAt:
          parsedStatus === "closed" || parsedStatus === "dismissed"
            ? now
            : null,
        updatedAt: now,
      })
      .where(eq(responseCases.id, responseCase.id));

    if (parsedStatus === "dismissed" && activeTasks.length > 0) {
      await transaction
        .update(caseTasks)
        .set({ status: "cancelled", completedAt: null, updatedAt: now })
        .where(
          inArray(
            caseTasks.id,
            activeTasks.map((task) => task.id),
          ),
        );
    }
    const attachedExposures = await transaction
      .select({ exposureId: caseExposures.exposureId })
      .from(caseExposures)
      .where(eq(caseExposures.caseId, responseCase.id));

    if (attachedExposures.length > 0) {
      await transaction
        .update(credentialExposures)
        .set({
          status:
            parsedStatus === "closed"
              ? "remediated"
              : parsedStatus === "dismissed"
                ? "dismissed"
                : "in_case",
          updatedAt: now,
        })
        .where(
          inArray(
            credentialExposures.id,
            attachedExposures.map((entry) => entry.exposureId),
          ),
        );
    }
    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: "case.status_changed",
      entityType: "response_case",
      entityId: responseCase.id,
      summary: `Case moved from ${responseCase.status} to ${parsedStatus}.`,
      metadata: {
        from: responseCase.status,
        cancelledTaskCount:
          parsedStatus === "dismissed" ? activeTasks.length : 0,
        resolution: trimmedResolution,
        to: parsedStatus,
      },
    });

    return { caseId: responseCase.id };
  });
}

type TaskStatus = (typeof taskStatuses)[number];

const taskStatusSchema = z.enum(taskStatuses);
const allowedTaskTransitions: Record<TaskStatus, TaskStatus[]> = {
  todo: ["in_progress", "completed", "cancelled"],
  in_progress: ["todo", "completed", "cancelled"],
  completed: ["in_progress"],
  cancelled: ["todo"],
};

export async function transitionTask(
  taskId: string,
  nextStatus: z.infer<typeof taskStatusSchema>,
  actorOperatorId?: string,
) {
  const parsedTaskId = z.string().uuid().parse(taskId);
  const parsedStatus = taskStatusSchema.parse(nextStatus);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);

  return database.transaction(async (transaction) => {
    const { caseStatus, task } = await requireCaseTaskForUpdate(
      transaction,
      workspace.id,
      parsedTaskId,
    );
    requireActiveCase(caseStatus);
    if (task.status === parsedStatus) {
      return { taskId: task.id, caseId: task.caseId };
    }
    if (!allowedTaskTransitions[task.status].includes(parsedStatus)) {
      throw new CredSignalWorkflowError(
        `A ${task.status.replaceAll("_", " ")} task cannot move directly to ${parsedStatus.replaceAll("_", " ")}.`,
      );
    }

    const [updatedTask] = await transaction
      .update(caseTasks)
      .set({
        status: parsedStatus,
        completedAt: parsedStatus === "completed" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(and(eq(caseTasks.id, task.id), eq(caseTasks.status, task.status)))
      .returning({ id: caseTasks.id });

    if (!updatedTask) {
      throw new CredSignalConflictError(
        "Another analyst updated this task before this change was saved.",
      );
    }
    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: "task.status_changed",
      entityType: "case_task",
      entityId: task.id,
      summary: `${task.title} moved from ${task.status} to ${parsedStatus}.`,
      metadata: { caseId: task.caseId, from: task.status, to: parsedStatus },
    });

    return { taskId: task.id, caseId: task.caseId };
  });
}

type CommunicationStatus = (typeof communicationStatuses)[number];

const communicationStatusSchema = z.enum(communicationStatuses);
const allowedCommunicationTransitions: Record<
  CommunicationStatus,
  CommunicationStatus[]
> = {
  draft: ["planned", "sent"],
  planned: ["draft", "sent", "failed"],
  sent: ["acknowledged", "failed"],
  acknowledged: [],
  failed: ["planned", "sent"],
};

export async function createCaseCommunication(
  rawInput: CreateCaseCommunicationInput,
  actorOperatorId?: string,
) {
  const input = createCaseCommunicationInputSchema.parse(rawInput);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);

  return database.transaction(async (transaction) => {
    const [responseCase] = await transaction
      .select({ id: responseCases.id, status: responseCases.status })
      .from(responseCases)
      .where(
        and(
          eq(responseCases.id, input.caseId),
          eq(responseCases.workspaceId, workspace.id),
        ),
      )
      .limit(1)
      .for("update");

    if (!responseCase) {
      throw new CredSignalNotFoundError("The response case no longer exists.");
    }
    if (
      responseCase.status === "closed" ||
      responseCase.status === "dismissed"
    ) {
      throw new CredSignalWorkflowError(
        "Reopen the case before adding a communication record.",
      );
    }

    const [communication] = await transaction
      .insert(communications)
      .values({
        caseId: responseCase.id,
        channel: input.channel,
        status: input.status,
        recipientLabel: input.recipientLabel,
        subject: input.subject || null,
        body: input.body || null,
        createdByOperatorId: actor?.id,
      })
      .returning({ id: communications.id });

    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: "communication.created",
      entityType: "communication",
      entityId: communication.id,
      summary: `${input.channel.replaceAll("_", " ")} communication ${input.status} for ${input.recipientLabel}.`,
      metadata: {
        caseId: responseCase.id,
        channel: input.channel,
        status: input.status,
      },
    });

    return { communicationId: communication.id, caseId: responseCase.id };
  });
}

export async function transitionCaseCommunication(
  communicationId: string,
  nextStatus: CommunicationStatus,
  actorOperatorId?: string,
) {
  const parsedCommunicationId = z.string().uuid().parse(communicationId);
  const parsedStatus = communicationStatusSchema.parse(nextStatus);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const [communication] = await database
    .select({
      id: communications.id,
      caseId: communications.caseId,
      recipientLabel: communications.recipientLabel,
      status: communications.status,
      sentAt: communications.sentAt,
      acknowledgedAt: communications.acknowledgedAt,
    })
    .from(communications)
    .innerJoin(responseCases, eq(communications.caseId, responseCases.id))
    .where(
      and(
        eq(communications.id, parsedCommunicationId),
        eq(responseCases.workspaceId, workspace.id),
      ),
    )
    .limit(1);

  if (!communication) {
    throw new CredSignalNotFoundError(
      "The communication record no longer exists.",
    );
  }
  if (communication.status === parsedStatus) {
    return { communicationId: communication.id, caseId: communication.caseId };
  }
  if (
    !allowedCommunicationTransitions[communication.status].includes(
      parsedStatus,
    )
  ) {
    throw new CredSignalWorkflowError(
      `A ${communication.status} communication cannot move directly to ${parsedStatus}.`,
    );
  }

  const now = new Date();
  return database.transaction(async (transaction) => {
    const [updatedCommunication] = await transaction
      .update(communications)
      .set({
        status: parsedStatus,
        sentAt: parsedStatus === "sent" ? now : communication.sentAt,
        acknowledgedAt:
          parsedStatus === "acknowledged" ? now : communication.acknowledgedAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(communications.id, communication.id),
          eq(communications.status, communication.status),
        ),
      )
      .returning({ id: communications.id });

    if (!updatedCommunication) {
      throw new CredSignalConflictError(
        "Another analyst updated this communication before this change was saved.",
      );
    }

    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: "communication.status_changed",
      entityType: "communication",
      entityId: communication.id,
      summary: `Communication for ${communication.recipientLabel} moved from ${communication.status} to ${parsedStatus}.`,
      metadata: {
        caseId: communication.caseId,
        from: communication.status,
        to: parsedStatus,
      },
    });

    return { communicationId: communication.id, caseId: communication.caseId };
  });
}

export async function revealCredential(
  exposureId: string,
  actorOperatorId?: string,
) {
  const parsedExposureId = z.string().uuid().parse(exposureId);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const [exposure] = await database
    .select()
    .from(credentialExposures)
    .where(
      and(
        eq(credentialExposures.id, parsedExposureId),
        eq(credentialExposures.workspaceId, workspace.id),
      ),
    )
    .limit(1);

  if (!exposure) {
    throw new CredSignalNotFoundError(
      "The credential exposure no longer exists.",
    );
  }
  if (
    !exposure.credentialCiphertext ||
    !exposure.credentialIv ||
    !exposure.credentialAuthTag ||
    !exposure.credentialKeyVersion
  ) {
    throw new CredSignalNotFoundError(
      "This exposure does not contain a stored credential value.",
    );
  }

  const cryptoConfig = getCredentialCryptoConfig();
  const value = decryptSecret(
    {
      ciphertext: exposure.credentialCiphertext,
      iv: exposure.credentialIv,
      authTag: exposure.credentialAuthTag,
      keyVersion: exposure.credentialKeyVersion,
    },
    cryptoConfig.dataKey,
  );

  await database.insert(activityLog).values({
    workspaceId: workspace.id,
    actorOperatorId: actor?.id,
    action: "credential.revealed",
    entityType: "credential_exposure",
    entityId: exposure.id,
    summary: "Stored credential value was revealed.",
  });

  return value;
}

export async function revealManagedCredential(
  credentialId: string,
  actorOperatorId?: string,
) {
  const parsedCredentialId = z.string().uuid().parse(credentialId);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const [credential] = await database
    .select({
      id: credentialAssets.id,
      service: credentialAssets.service,
      status: credentialAssets.status,
    })
    .from(credentialAssets)
    .where(
      and(
        eq(credentialAssets.id, parsedCredentialId),
        eq(credentialAssets.workspaceId, workspace.id),
      ),
    )
    .limit(1);
  if (!credential) {
    throw new CredSignalNotFoundError(
      "The managed credential no longer exists.",
    );
  }
  if (credential.status === "retired") {
    throw new CredSignalConflictError(
      "Retired credential values are not available from the active inventory.",
    );
  }

  const [version] = await database
    .select()
    .from(credentialVersions)
    .where(
      and(
        eq(credentialVersions.credentialId, credential.id),
        eq(credentialVersions.status, "active"),
      ),
    )
    .limit(1);
  if (!version) {
    throw new CredSignalNotFoundError(
      "This credential does not have an active value. Rotate it to create a new version.",
    );
  }

  const cryptoConfig = getCredentialCryptoConfig();
  const value = decryptSecret(
    {
      ciphertext: version.credentialCiphertext,
      iv: version.credentialIv,
      authTag: version.credentialAuthTag,
      keyVersion: version.credentialKeyVersion,
    },
    cryptoConfig.dataKey,
  );
  await database.insert(activityLog).values({
    workspaceId: workspace.id,
    actorOperatorId: actor?.id,
    action: "managed_credential.revealed",
    entityType: "credential_asset",
    entityId: credential.id,
    summary: `${credential.service} managed credential was revealed.`,
    metadata: { versionId: version.id, version: version.version },
  });

  return value;
}
