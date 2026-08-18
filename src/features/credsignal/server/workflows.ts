import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import {
  buildExposureDedupeKey,
  classifyCredentialSeverity,
  createExposureInputSchema,
  createProtecteeInputSchema,
  matchExposureInputSchema,
  normalizeIdentity,
  type CreateExposureInput,
  type CreateProtecteeInput,
  type ExposurePriority,
  type MatchExposureInput,
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
    .select()
    .from(protecteeIdentities)
    .where(
      and(
        eq(protecteeIdentities.workspaceId, workspace.id),
        eq(protecteeIdentities.type, input.identityType),
        eq(protecteeIdentities.normalizedValue, normalizedIdentity),
        eq(protecteeIdentities.isActive, true),
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
  const [responseCase] = await database
    .select()
    .from(responseCases)
    .where(
      and(
        eq(responseCases.id, parsedCaseId),
        eq(responseCases.workspaceId, workspace.id),
      ),
    )
    .limit(1);

  if (!responseCase) {
    throw new CredSignalNotFoundError("The response case no longer exists.");
  }
  if (responseCase.status === parsedStatus) {
    return;
  }
  if (!allowedCaseTransitions[responseCase.status].includes(parsedStatus)) {
    throw new CredSignalWorkflowError(
      `A ${responseCase.status} case cannot move directly to ${parsedStatus}.`,
    );
  }
  const trimmedResolution = resolution?.trim();
  if (
    (parsedStatus === "closed" || parsedStatus === "dismissed") &&
    !trimmedResolution
  ) {
    throw new CredSignalWorkflowError(
      "A resolution is required before closing or dismissing a case.",
    );
  }

  await database.transaction(async (transaction) => {
    await transaction
      .update(responseCases)
      .set({
        status: parsedStatus,
        resolution: trimmedResolution || null,
        closedAt:
          parsedStatus === "closed" || parsedStatus === "dismissed"
            ? new Date()
            : null,
        updatedAt: new Date(),
      })
      .where(eq(responseCases.id, responseCase.id));
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
          updatedAt: new Date(),
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
        resolution: trimmedResolution,
        to: parsedStatus,
      },
    });
  });
}

const taskStatusSchema = z.enum([
  "todo",
  "in_progress",
  "completed",
  "cancelled",
]);

export async function transitionTask(
  taskId: string,
  nextStatus: z.infer<typeof taskStatusSchema>,
  actorOperatorId?: string,
) {
  const parsedTaskId = z.string().uuid().parse(taskId);
  const parsedStatus = taskStatusSchema.parse(nextStatus);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const [task] = await database
    .select({
      id: caseTasks.id,
      caseId: caseTasks.caseId,
      status: caseTasks.status,
      title: caseTasks.title,
    })
    .from(caseTasks)
    .innerJoin(responseCases, eq(caseTasks.caseId, responseCases.id))
    .where(
      and(
        eq(caseTasks.id, parsedTaskId),
        eq(responseCases.workspaceId, workspace.id),
      ),
    )
    .limit(1);

  if (!task) {
    throw new CredSignalNotFoundError("The remediation task no longer exists.");
  }

  await database.transaction(async (transaction) => {
    await transaction
      .update(caseTasks)
      .set({
        status: parsedStatus,
        completedAt: parsedStatus === "completed" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(caseTasks.id, task.id));
    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: "task.status_changed",
      entityType: "case_task",
      entityId: task.id,
      summary: `${task.title} moved from ${task.status} to ${parsedStatus}.`,
      metadata: { caseId: task.caseId, from: task.status, to: parsedStatus },
    });
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
