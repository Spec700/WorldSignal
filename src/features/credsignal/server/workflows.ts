import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import {
  addProtecteeIdentityInputSchema,
  buildExposureDedupeKey,
  classifyCredentialSeverity,
  communicationStatuses,
  createCaseCommunicationInputSchema,
  createCaseTaskInputSchema,
  createExposureInputSchema,
  createProtecteeInputSchema,
  matchExposureInputSchema,
  normalizeIdentity,
  replaceProtecteeLocationInputSchema,
  taskStatuses,
  updateCaseCoordinationInputSchema,
  updateCaseTaskInputSchema,
  updateProtecteeInputSchema,
  type AddProtecteeIdentityInput,
  type CreateCaseCommunicationInput,
  type CreateCaseTaskInput,
  type CreateExposureInput,
  type CreateProtecteeInput,
  type ExposurePriority,
  type MatchExposureInput,
  type ReplaceProtecteeLocationInput,
  type UpdateCaseCoordinationInput,
  type UpdateCaseTaskInput,
  type UpdateProtecteeInput,
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
  credentialExposures,
  exposureMatches,
  exposureSources,
  operators,
  protecteeIdentities,
  protecteeLocations,
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

async function requireProtectee(
  database: CredSignalDatabase,
  workspaceId: string,
  protecteeId: string,
) {
  const parsedProtecteeId = z.string().uuid().parse(protecteeId);
  const [protectee] = await database
    .select()
    .from(protectees)
    .where(
      and(
        eq(protectees.id, parsedProtecteeId),
        eq(protectees.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!protectee) {
    throw new CredSignalNotFoundError(
      "The selected protectee no longer exists in this workspace.",
    );
  }

  return protectee;
}

export async function createProtectee(
  rawInput: CreateProtecteeInput,
  actorOperatorId?: string,
) {
  const input = createProtecteeInputSchema.parse(rawInput);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const normalizedIdentity = normalizeIdentity(
    input.identityType,
    input.identityValue,
  );
  const [existingIdentity] = await database
    .select({
      id: protecteeIdentities.id,
      protecteeId: protecteeIdentities.protecteeId,
    })
    .from(protecteeIdentities)
    .where(
      and(
        eq(protecteeIdentities.workspaceId, workspace.id),
        eq(protecteeIdentities.type, input.identityType),
        eq(protecteeIdentities.normalizedValue, normalizedIdentity),
      ),
    )
    .limit(1);

  if (existingIdentity) {
    throw new CredSignalConflictError(
      "That identity is already assigned to a protectee in this workspace.",
    );
  }

  return database.transaction(async (transaction) => {
    const [protectee] = await transaction
      .insert(protectees)
      .values({
        workspaceId: workspace.id,
        displayName: input.displayName,
        title: input.title || null,
        organization: input.organization || null,
        tier: input.tier,
      })
      .returning();
    const [identity] = await transaction
      .insert(protecteeIdentities)
      .values({
        workspaceId: workspace.id,
        protecteeId: protectee.id,
        type: input.identityType,
        displayValue: input.identityValue,
        normalizedValue: normalizedIdentity,
        isPrimary: true,
        verifiedAt: new Date(),
      })
      .returning();
    const [location] = await transaction
      .insert(protecteeLocations)
      .values({
        protecteeId: protectee.id,
        label: input.locationLabel,
        latitude: input.latitude,
        longitude: input.longitude,
        precision: "city",
      })
      .returning();

    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: "protectee.created",
      entityType: "protectee",
      entityId: protectee.id,
      summary: `${protectee.displayName} was added to credential monitoring.`,
      metadata: {
        identityType: identity.type,
        locationPrecision: location.precision,
        tier: protectee.tier,
      },
    });

    return { protecteeId: protectee.id };
  });
}

export async function updateProtectee(
  rawInput: UpdateProtecteeInput,
  actorOperatorId?: string,
) {
  const input = updateProtecteeInputSchema.parse(rawInput);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const protectee = await requireProtectee(
    database,
    workspace.id,
    input.protecteeId,
  );

  if (input.status === "archived") {
    const activeCases = await database
      .select({ status: responseCases.status })
      .from(responseCases)
      .where(eq(responseCases.protecteeId, protectee.id));
    if (
      activeCases.some(
        (responseCase) =>
          responseCase.status !== "closed" &&
          responseCase.status !== "dismissed",
      )
    ) {
      throw new CredSignalWorkflowError(
        "Close or dismiss every active case before archiving this protectee.",
      );
    }
  }

  return database.transaction(async (transaction) => {
    const [updatedProtectee] = await transaction
      .update(protectees)
      .set({
        displayName: input.displayName,
        title: input.title || null,
        organization: input.organization || null,
        tier: input.tier,
        status: input.status,
        updatedAt: new Date(),
      })
      .where(eq(protectees.id, protectee.id))
      .returning();

    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: "protectee.updated",
      entityType: "protectee",
      entityId: protectee.id,
      summary: `${updatedProtectee.displayName} monitoring profile was updated.`,
      metadata: {
        previousStatus: protectee.status,
        status: updatedProtectee.status,
        tier: updatedProtectee.tier,
      },
    });

    return { protecteeId: updatedProtectee.id };
  });
}

export async function addProtecteeIdentity(
  rawInput: AddProtecteeIdentityInput,
  actorOperatorId?: string,
) {
  const input = addProtecteeIdentityInputSchema.parse(rawInput);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const protectee = await requireProtectee(
    database,
    workspace.id,
    input.protecteeId,
  );
  const normalizedValue = normalizeIdentity(input.type, input.value);
  const [existingIdentity] = await database
    .select()
    .from(protecteeIdentities)
    .where(
      and(
        eq(protecteeIdentities.workspaceId, workspace.id),
        eq(protecteeIdentities.type, input.type),
        eq(protecteeIdentities.normalizedValue, normalizedValue),
      ),
    )
    .limit(1);

  if (existingIdentity?.protecteeId !== undefined) {
    if (existingIdentity.protecteeId !== protectee.id) {
      throw new CredSignalConflictError(
        "That identity already belongs to another protectee in this workspace.",
      );
    }
    if (existingIdentity.isActive) {
      throw new CredSignalConflictError(
        "That identity is already active for this protectee.",
      );
    }
  }

  const [currentPrimary] = await database
    .select({ id: protecteeIdentities.id })
    .from(protecteeIdentities)
    .where(
      and(
        eq(protecteeIdentities.protecteeId, protectee.id),
        eq(protecteeIdentities.isActive, true),
        eq(protecteeIdentities.isPrimary, true),
      ),
    )
    .limit(1);
  const makePrimary = input.makePrimary || !currentPrimary;
  const now = new Date();

  return database.transaction(async (transaction) => {
    if (makePrimary) {
      await transaction
        .update(protecteeIdentities)
        .set({ isPrimary: false, updatedAt: now })
        .where(eq(protecteeIdentities.protecteeId, protectee.id));
    }

    const [identity] = existingIdentity
      ? await transaction
          .update(protecteeIdentities)
          .set({
            displayValue: input.value,
            isActive: true,
            isPrimary: makePrimary,
            verifiedAt: now,
            updatedAt: now,
          })
          .where(eq(protecteeIdentities.id, existingIdentity.id))
          .returning()
      : await transaction
          .insert(protecteeIdentities)
          .values({
            workspaceId: workspace.id,
            protecteeId: protectee.id,
            type: input.type,
            displayValue: input.value,
            normalizedValue,
            isActive: true,
            isPrimary: makePrimary,
            verifiedAt: now,
          })
          .returning();

    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: existingIdentity
        ? "protectee.identity_reactivated"
        : "protectee.identity_added",
      entityType: "protectee_identity",
      entityId: identity.id,
      summary: `${input.type.replaceAll("_", " ")} identity ${existingIdentity ? "reactivated" : "added"} for ${protectee.displayName}.`,
      metadata: { makePrimary, protecteeId: protectee.id },
    });

    return { identityId: identity.id, protecteeId: protectee.id };
  });
}

export async function setPrimaryProtecteeIdentity(
  identityId: string,
  actorOperatorId?: string,
) {
  const parsedIdentityId = z.string().uuid().parse(identityId);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const [identity] = await database
    .select({
      id: protecteeIdentities.id,
      protecteeId: protecteeIdentities.protecteeId,
      displayValue: protecteeIdentities.displayValue,
    })
    .from(protecteeIdentities)
    .where(
      and(
        eq(protecteeIdentities.id, parsedIdentityId),
        eq(protecteeIdentities.workspaceId, workspace.id),
        eq(protecteeIdentities.isActive, true),
      ),
    )
    .limit(1);

  if (!identity) {
    throw new CredSignalNotFoundError(
      "The selected identity is not active in this workspace.",
    );
  }
  const protectee = await requireProtectee(
    database,
    workspace.id,
    identity.protecteeId,
  );
  const now = new Date();

  await database.transaction(async (transaction) => {
    await transaction
      .update(protecteeIdentities)
      .set({ isPrimary: false, updatedAt: now })
      .where(eq(protecteeIdentities.protecteeId, identity.protecteeId));
    await transaction
      .update(protecteeIdentities)
      .set({ isPrimary: true, updatedAt: now })
      .where(eq(protecteeIdentities.id, identity.id));
    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: "protectee.primary_identity_changed",
      entityType: "protectee_identity",
      entityId: identity.id,
      summary: `Primary identity changed for ${protectee.displayName}.`,
      metadata: { protecteeId: protectee.id },
    });
  });

  return { identityId: identity.id, protecteeId: protectee.id };
}

export async function deactivateProtecteeIdentity(
  identityId: string,
  actorOperatorId?: string,
) {
  const parsedIdentityId = z.string().uuid().parse(identityId);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const [identity] = await database
    .select()
    .from(protecteeIdentities)
    .where(
      and(
        eq(protecteeIdentities.id, parsedIdentityId),
        eq(protecteeIdentities.workspaceId, workspace.id),
      ),
    )
    .limit(1);

  if (!identity || !identity.isActive) {
    throw new CredSignalNotFoundError(
      "The selected identity is not active in this workspace.",
    );
  }
  if (identity.isPrimary) {
    throw new CredSignalWorkflowError(
      "Choose a different primary identity before deactivating this one.",
    );
  }
  const protectee = await requireProtectee(
    database,
    workspace.id,
    identity.protecteeId,
  );
  const activeIdentities = await database
    .select({ id: protecteeIdentities.id })
    .from(protecteeIdentities)
    .where(
      and(
        eq(protecteeIdentities.protecteeId, protectee.id),
        eq(protecteeIdentities.isActive, true),
      ),
    );
  if (activeIdentities.length <= 1) {
    throw new CredSignalWorkflowError(
      "A monitored protectee must retain at least one active identity.",
    );
  }

  await database.transaction(async (transaction) => {
    await transaction
      .update(protecteeIdentities)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(protecteeIdentities.id, identity.id));
    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: "protectee.identity_deactivated",
      entityType: "protectee_identity",
      entityId: identity.id,
      summary: `Identity deactivated for ${protectee.displayName}.`,
      metadata: { protecteeId: protectee.id },
    });
  });

  return { identityId: identity.id, protecteeId: protectee.id };
}

export async function replaceProtecteeLocation(
  rawInput: ReplaceProtecteeLocationInput,
  actorOperatorId?: string,
) {
  const input = replaceProtecteeLocationInputSchema.parse(rawInput);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const protectee = await requireProtectee(
    database,
    workspace.id,
    input.protecteeId,
  );
  const now = new Date();

  return database.transaction(async (transaction) => {
    await transaction
      .update(protecteeLocations)
      .set({ isActive: false, effectiveTo: now, updatedAt: now })
      .where(
        and(
          eq(protecteeLocations.protecteeId, protectee.id),
          eq(protecteeLocations.isActive, true),
        ),
      );
    const [location] = await transaction
      .insert(protecteeLocations)
      .values({
        protecteeId: protectee.id,
        label: input.label,
        latitude: input.latitude,
        longitude: input.longitude,
        precision: input.precision,
        effectiveFrom: now,
      })
      .returning();
    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: "protectee.location_changed",
      entityType: "protectee_location",
      entityId: location.id,
      summary: `Operational location changed for ${protectee.displayName}.`,
      metadata: {
        label: location.label,
        precision: location.precision,
        protecteeId: protectee.id,
      },
    });

    return { locationId: location.id, protecteeId: protectee.id };
  });
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

    const [match] = await transaction
      .insert(exposureMatches)
      .values({
        exposureId: exposure.id,
        protecteeId: approvedIdentity.protecteeId,
        identityId: approvedIdentity.id,
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
