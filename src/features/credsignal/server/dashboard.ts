import { and, asc, desc, eq, inArray } from "drizzle-orm";

import type {
  CredSignalCaseDto,
  CredSignalCredentialDto,
  CredSignalDashboardDto,
  CredSignalExposureDto,
  CredSignalPriority,
  CredSignalProtecteeDto,
} from "@/features/credsignal/types";
import { currentPersonLocation } from "@/features/people/location-model";
import type { PersonLocationDto } from "@/features/people/types";
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
  protecteeLocations,
  protectees,
  responseCases,
  workspaces,
} from "@/lib/db/schema";

const priorityRank: Record<CredSignalPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const terminalCaseStatuses = new Set(["closed", "dismissed"]);
const terminalTaskStatuses = new Set(["completed", "cancelled"]);

function highestPriority(
  priorities: CredSignalPriority[],
): CredSignalPriority | undefined {
  return priorities.reduce<CredSignalPriority | undefined>((current, value) => {
    if (!current || priorityRank[value] > priorityRank[current]) {
      return value;
    }
    return current;
  }, undefined);
}

const emptyDashboard: CredSignalDashboardDto = {
  setupRequired: true,
  operators: [],
  credentials: [],
  protectees: [],
  unmatchedExposures: [],
  recentActivity: [],
  metrics: {
    protectees: 0,
    credentials: 0,
    exposedCredentials: 0,
    openCases: 0,
    criticalProtectees: 0,
    overdueTasks: 0,
    unmatchedExposures: 0,
  },
};

export async function getCredSignalDashboard(): Promise<CredSignalDashboardDto> {
  const database = getDatabase();
  const workspaceSlug = process.env.CREDSIGNAL_WORKSPACE_SLUG ?? "local";
  const [workspace] = await database
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, workspaceSlug))
    .limit(1);

  if (!workspace) {
    return emptyDashboard;
  }

  const [
    operatorRows,
    protecteeRows,
    identityRows,
    credentialRows,
    sourceRows,
    exposureRows,
    caseRows,
    activityRows,
  ] = await Promise.all([
    database
      .select()
      .from(operators)
      .where(
        and(
          eq(operators.workspaceId, workspace.id),
          eq(operators.status, "active"),
        ),
      )
      .orderBy(asc(operators.displayName)),
    database
      .select()
      .from(protectees)
      .where(eq(protectees.workspaceId, workspace.id))
      .orderBy(asc(protectees.displayName)),
    database
      .select()
      .from(protecteeIdentities)
      .where(eq(protecteeIdentities.workspaceId, workspace.id))
      .orderBy(desc(protecteeIdentities.isPrimary)),
    database
      .select()
      .from(credentialAssets)
      .where(eq(credentialAssets.workspaceId, workspace.id))
      .orderBy(asc(credentialAssets.service)),
    database
      .select()
      .from(exposureSources)
      .where(eq(exposureSources.workspaceId, workspace.id)),
    database
      .select()
      .from(credentialExposures)
      .where(eq(credentialExposures.workspaceId, workspace.id))
      .orderBy(desc(credentialExposures.observedAt)),
    database
      .select()
      .from(responseCases)
      .where(eq(responseCases.workspaceId, workspace.id))
      .orderBy(desc(responseCases.openedAt)),
    database
      .select()
      .from(activityLog)
      .where(eq(activityLog.workspaceId, workspace.id))
      .orderBy(desc(activityLog.occurredAt))
      .limit(80),
  ]);

  const protecteeIds = protecteeRows.map((protectee) => protectee.id);
  const exposureIds = exposureRows.map((exposure) => exposure.id);
  const credentialIds = credentialRows.map((credential) => credential.id);
  const caseIds = caseRows.map((responseCase) => responseCase.id);
  const [
    locationRows,
    matchRows,
    caseExposureRows,
    taskRows,
    communicationRows,
    versionRows,
  ] = await Promise.all([
    protecteeIds.length > 0
      ? database
          .select()
          .from(protecteeLocations)
          .where(inArray(protecteeLocations.protecteeId, protecteeIds))
          .orderBy(desc(protecteeLocations.effectiveFrom))
      : [],
    exposureIds.length > 0
      ? database
          .select()
          .from(exposureMatches)
          .where(inArray(exposureMatches.exposureId, exposureIds))
      : [],
    caseIds.length > 0
      ? database
          .select()
          .from(caseExposures)
          .where(inArray(caseExposures.caseId, caseIds))
      : [],
    caseIds.length > 0
      ? database
          .select()
          .from(caseTasks)
          .where(inArray(caseTasks.caseId, caseIds))
          .orderBy(asc(caseTasks.dueAt))
      : [],
    caseIds.length > 0
      ? database
          .select()
          .from(communications)
          .where(inArray(communications.caseId, caseIds))
          .orderBy(desc(communications.createdAt))
      : [],
    credentialIds.length > 0
      ? database
          .select()
          .from(credentialVersions)
          .where(inArray(credentialVersions.credentialId, credentialIds))
          .orderBy(desc(credentialVersions.version))
      : [],
  ]);

  const operatorNameById = new Map(
    operatorRows.map((operator) => [operator.id, operator.displayName]),
  );
  const sourceById = new Map(sourceRows.map((source) => [source.id, source]));
  const protecteeIdByExposureId = new Map(
    matchRows.map((match) => [match.exposureId, match.protecteeId]),
  );
  const matchByExposureId = new Map(
    matchRows.map((match) => [match.exposureId, match]),
  );

  const exposureDtos = exposureRows.map<CredSignalExposureDto>((exposure) => {
    const source = sourceById.get(exposure.sourceId);
    const match = matchByExposureId.get(exposure.id);

    return {
      id: exposure.id,
      credentialId: match?.credentialId ?? undefined,
      matchedProtecteeId: match?.protecteeId,
      exposedIdentity: exposure.exposedIdentityDisplay,
      identityType: exposure.exposedIdentityType,
      credentialKind: exposure.credentialKind,
      hasCredentialValue: Boolean(exposure.credentialCiphertext),
      service: exposure.service ?? undefined,
      serviceDomain: exposure.serviceDomain ?? undefined,
      sourceName: source?.name ?? "Unknown source",
      sourceType: source?.type ?? "other",
      severity: exposure.severity,
      confidence: exposure.confidence,
      verification: exposure.verification,
      status: exposure.status,
      observedAt: exposure.observedAt.toISOString(),
      notes: exposure.notes ?? undefined,
    };
  });
  const exposureDtoById = new Map(
    exposureDtos.map((exposure) => [exposure.id, exposure]),
  );

  const caseDtos = caseRows.map<CredSignalCaseDto>((responseCase) => ({
    id: responseCase.id,
    title: responseCase.title,
    status: responseCase.status,
    priority: responseCase.priority,
    assigneeId: responseCase.assigneeOperatorId ?? undefined,
    assigneeName: responseCase.assigneeOperatorId
      ? operatorNameById.get(responseCase.assigneeOperatorId)
      : undefined,
    dueAt: responseCase.dueAt?.toISOString(),
    openedAt: responseCase.openedAt.toISOString(),
    closedAt: responseCase.closedAt?.toISOString(),
    resolution: responseCase.resolution ?? undefined,
    exposureIds: caseExposureRows
      .filter((entry) => entry.caseId === responseCase.id)
      .map((entry) => entry.exposureId),
    tasks: taskRows
      .filter((task) => task.caseId === responseCase.id)
      .map((task) => ({
        id: task.id,
        type: task.type,
        title: task.title,
        status: task.status,
        assigneeId: task.assigneeOperatorId ?? undefined,
        assigneeName: task.assigneeOperatorId
          ? operatorNameById.get(task.assigneeOperatorId)
          : undefined,
        dueAt: task.dueAt?.toISOString(),
        completedAt: task.completedAt?.toISOString(),
        notes: task.notes ?? undefined,
      })),
    communications: communicationRows
      .filter((communication) => communication.caseId === responseCase.id)
      .map((communication) => ({
        id: communication.id,
        channel: communication.channel,
        status: communication.status,
        recipientLabel: communication.recipientLabel,
        subject: communication.subject ?? undefined,
        body: communication.body ?? undefined,
        sentAt: communication.sentAt?.toISOString(),
        acknowledgedAt: communication.acknowledgedAt?.toISOString(),
        createdAt: communication.createdAt.toISOString(),
      })),
  }));

  const credentialDtos = credentialRows.map<CredSignalCredentialDto>(
    (credential) => {
      const protectee = protecteeRows.find(
        (entry) => entry.id === credential.protecteeId,
      );
      const versions = versionRows
        .filter((version) => version.credentialId === credential.id)
        .map((version) => ({
          id: version.id,
          version: version.version,
          status: version.status,
          hasCredentialValue: Boolean(version.credentialCiphertext),
          activatedAt: version.activatedAt.toISOString(),
          retiredAt: version.retiredAt?.toISOString(),
        }));
      const exposures = exposureDtos.filter(
        (exposure) => exposure.credentialId === credential.id,
      );
      const linkedExposureIds = new Set(
        exposures.map((exposure) => exposure.id),
      );
      const openCaseCount = caseDtos.filter(
        (responseCase) =>
          !terminalCaseStatuses.has(responseCase.status) &&
          responseCase.exposureIds.some((exposureId) =>
            linkedExposureIds.has(exposureId),
          ),
      ).length;
      const activeExposures = exposures.filter(
        (exposure) =>
          exposure.status !== "remediated" && exposure.status !== "dismissed",
      );
      const exposurePosture: CredSignalCredentialDto["exposurePosture"] =
        activeExposures.some((exposure) => exposure.status === "in_case")
          ? "in_response"
          : activeExposures.some(
                (exposure) => exposure.verification === "confirmed",
              )
            ? "confirmed_exposure"
            : activeExposures.length > 0
              ? "potential_exposure"
              : exposures.length > 0
                ? "remediated"
                : "no_known_exposure";

      return {
        id: credential.id,
        protecteeId: credential.protecteeId,
        protecteeName: protectee?.displayName ?? "Unknown person",
        identityId: credential.identityId ?? undefined,
        accountIdentifier: credential.accountIdentifier,
        service: credential.service,
        serviceDomain: credential.serviceDomain ?? undefined,
        credentialKind:
          credential.credentialKind as CredSignalCredentialDto["credentialKind"],
        status: credential.status,
        exposurePosture,
        exposures,
        versions,
        currentVersion: versions.find((version) => version.status === "active"),
        openCaseCount,
        notes: credential.notes ?? undefined,
        updatedAt: credential.updatedAt.toISOString(),
      };
    },
  );

  const protecteeDtos = protecteeRows.map<CredSignalProtecteeDto>(
    (protectee) => {
      const protecteeExposureIds = matchRows
        .filter((match) => match.protecteeId === protectee.id)
        .map((match) => match.exposureId);
      const exposures = protecteeExposureIds
        .map((id) => exposureDtoById.get(id))
        .filter((exposure): exposure is CredSignalExposureDto =>
          Boolean(exposure),
        );
      const cases = caseDtos.filter(
        (responseCase) =>
          caseRows.find((row) => row.id === responseCase.id)?.protecteeId ===
          protectee.id,
      );
      const credentials = credentialDtos.filter(
        (credential) => credential.protecteeId === protectee.id,
      );
      const openCases = cases.filter(
        (responseCase) => !terminalCaseStatuses.has(responseCase.status),
      );
      const openTasks = openCases.flatMap((responseCase) =>
        responseCase.tasks.filter(
          (task) => !terminalTaskStatuses.has(task.status),
        ),
      );
      const activePriority = highestPriority([
        ...openCases.map((responseCase) => responseCase.priority),
        ...exposures
          .filter(
            (exposure) =>
              exposure.status !== "remediated" &&
              exposure.status !== "dismissed",
          )
          .map((exposure) => exposure.severity),
      ]);
      const locationHistory = locationRows
        .filter((location) => location.protecteeId === protectee.id)
        .map<PersonLocationDto>((location) => ({
          id: location.id,
          label: location.label,
          latitude: location.latitude,
          longitude: location.longitude,
          precision: location.precision,
          isActive: location.isActive,
          effectiveFrom: location.effectiveFrom.toISOString(),
          effectiveTo: location.effectiveTo?.toISOString(),
        }));

      return {
        id: protectee.id,
        displayName: protectee.displayName,
        title: protectee.title ?? undefined,
        organization: protectee.organization ?? undefined,
        tier: protectee.tier,
        status: protectee.status,
        notes: protectee.notes ?? undefined,
        identities: identityRows
          .filter((identity) => identity.protecteeId === protectee.id)
          .map((identity) => ({
            id: identity.id,
            type: identity.type,
            displayValue: identity.displayValue,
            isPrimary: identity.isPrimary,
            isActive: identity.isActive,
            verifiedAt: identity.verifiedAt?.toISOString(),
          })),
        location: currentPersonLocation(locationHistory),
        locationHistory,
        createdAt: protectee.createdAt.toISOString(),
        updatedAt: protectee.updatedAt.toISOString(),
        credentials,
        exposures,
        cases,
        activePriority,
        openCaseCount: openCases.length,
        openTaskCount: openTasks.length,
      };
    },
  );

  const unmatchedExposures = exposureDtos.filter(
    (exposure) => !protecteeIdByExposureId.has(exposure.id),
  );
  const now = Date.now();
  const openCases = caseDtos.filter(
    (responseCase) => !terminalCaseStatuses.has(responseCase.status),
  );
  const overdueTasks = openCases.flatMap((responseCase) =>
    responseCase.tasks.filter(
      (task) =>
        !terminalTaskStatuses.has(task.status) &&
        task.dueAt !== undefined &&
        Date.parse(task.dueAt) < now,
    ),
  );

  return {
    setupRequired: false,
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
    },
    operators: operatorRows.map((operator) => ({
      id: operator.id,
      displayName: operator.displayName,
      email: operator.email,
    })),
    credentials: credentialDtos,
    protectees: protecteeDtos,
    unmatchedExposures,
    recentActivity: activityRows.map((activity) => ({
      id: activity.id,
      action: activity.action,
      summary: activity.summary,
      actorName: activity.actorOperatorId
        ? operatorNameById.get(activity.actorOperatorId)
        : undefined,
      entityType: activity.entityType,
      entityId: activity.entityId,
      occurredAt: activity.occurredAt.toISOString(),
    })),
    metrics: {
      protectees: protecteeDtos.length,
      credentials: credentialDtos.length,
      exposedCredentials: credentialDtos.filter(
        (credential) =>
          credential.exposurePosture === "confirmed_exposure" ||
          credential.exposurePosture === "in_response",
      ).length,
      openCases: openCases.length,
      criticalProtectees: protecteeDtos.filter(
        (protectee) => protectee.activePriority === "critical",
      ).length,
      overdueTasks: overdueTasks.length,
      unmatchedExposures: unmatchedExposures.length,
    },
  };
}
