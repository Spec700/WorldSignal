import { eq } from "drizzle-orm";

import {
  buildExposureDedupeKey,
  normalizeIdentity,
} from "../src/features/credsignal/domain";
import { getCredentialCryptoConfig } from "../src/lib/credentials/config";
import {
  encryptSecret,
  fingerprintSecret,
} from "../src/lib/credentials/secret-crypto";
import { closeDatabase, getDatabase } from "../src/lib/db/client";
import {
  activityLog,
  caseExposures,
  caseTasks,
  communications,
  credentialExposures,
  exposureMatches,
  exposureSources,
  operatorRoles,
  operators,
  protecteeIdentities,
  protecteeLocations,
  protectees,
  responseCases,
  roles,
  workspaces,
} from "../src/lib/db/schema";

const ids = {
  workspace: "00000000-0000-4000-8000-000000000001",
  roles: {
    admin: "10000000-0000-4000-8000-000000000001",
    lead: "10000000-0000-4000-8000-000000000002",
    analyst: "10000000-0000-4000-8000-000000000003",
    viewer: "10000000-0000-4000-8000-000000000004",
  },
  operators: {
    lena: "20000000-0000-4000-8000-000000000001",
    omar: "20000000-0000-4000-8000-000000000002",
    priya: "20000000-0000-4000-8000-000000000003",
  },
  protectees: {
    avery: "30000000-0000-4000-8000-000000000001",
    maya: "30000000-0000-4000-8000-000000000002",
    elias: "30000000-0000-4000-8000-000000000003",
  },
  identities: {
    avery: "40000000-0000-4000-8000-000000000001",
    maya: "40000000-0000-4000-8000-000000000002",
    elias: "40000000-0000-4000-8000-000000000003",
  },
  locations: {
    avery: "50000000-0000-4000-8000-000000000001",
    maya: "50000000-0000-4000-8000-000000000002",
    elias: "50000000-0000-4000-8000-000000000003",
  },
  sources: {
    stealer: "60000000-0000-4000-8000-000000000001",
    breach: "60000000-0000-4000-8000-000000000002",
    phishing: "60000000-0000-4000-8000-000000000003",
  },
  exposures: {
    avery: "70000000-0000-4000-8000-000000000001",
    maya: "70000000-0000-4000-8000-000000000002",
    elias: "70000000-0000-4000-8000-000000000003",
  },
  matches: {
    avery: "80000000-0000-4000-8000-000000000001",
    maya: "80000000-0000-4000-8000-000000000002",
    elias: "80000000-0000-4000-8000-000000000003",
  },
  cases: {
    avery: "90000000-0000-4000-8000-000000000001",
    maya: "90000000-0000-4000-8000-000000000002",
    elias: "90000000-0000-4000-8000-000000000003",
  },
  tasks: {
    averyRevoke: "a0000000-0000-4000-8000-000000000001",
    averyReset: "a0000000-0000-4000-8000-000000000002",
    mayaReset: "a0000000-0000-4000-8000-000000000003",
    eliasVerify: "a0000000-0000-4000-8000-000000000004",
  },
  communication: "b0000000-0000-4000-8000-000000000001",
  activity: {
    averyExposure: "c0000000-0000-4000-8000-000000000001",
    averyCase: "c0000000-0000-4000-8000-000000000002",
    mayaExposure: "c0000000-0000-4000-8000-000000000003",
  },
} as const;

const observedAt = {
  stealer: new Date("2026-08-18T13:45:00.000Z"),
  breach: new Date("2026-08-16T09:20:00.000Z"),
  phishing: new Date("2026-08-17T20:10:00.000Z"),
};

async function seed() {
  const database = getDatabase();
  const cryptoConfig = getCredentialCryptoConfig();
  const workspaceSlug = process.env.CREDSIGNAL_WORKSPACE_SLUG ?? "local";

  const [workspace] = await database
    .insert(workspaces)
    .values({
      id: ids.workspace,
      name: "Priority Signals Local Team",
      slug: workspaceSlug,
    })
    .onConflictDoUpdate({
      target: workspaces.slug,
      set: { name: "Priority Signals Local Team", updatedAt: new Date() },
    })
    .returning();

  await database.transaction(async (transaction) => {
    await transaction
      .insert(roles)
      .values([
        {
          id: ids.roles.admin,
          workspaceId: workspace.id,
          slug: "admin",
          name: "Administrator",
          description: "Workspace and operator administration.",
        },
        {
          id: ids.roles.lead,
          workspaceId: workspace.id,
          slug: "lead",
          name: "Security Lead",
          description: "Case oversight, assignment, and closure.",
        },
        {
          id: ids.roles.analyst,
          workspaceId: workspace.id,
          slug: "analyst",
          name: "Analyst",
          description: "Exposure triage and remediation coordination.",
        },
        {
          id: ids.roles.viewer,
          workspaceId: workspace.id,
          slug: "viewer",
          name: "Viewer",
          description: "Read-only operational awareness when auth is added.",
        },
      ])
      .onConflictDoNothing();

    await transaction
      .insert(operators)
      .values([
        {
          id: ids.operators.lena,
          workspaceId: workspace.id,
          displayName: "Lena Park",
          email: "lena.park@priority-signals.example",
        },
        {
          id: ids.operators.omar,
          workspaceId: workspace.id,
          displayName: "Omar Haddad",
          email: "omar.haddad@priority-signals.example",
        },
        {
          id: ids.operators.priya,
          workspaceId: workspace.id,
          displayName: "Priya Shah",
          email: "priya.shah@priority-signals.example",
        },
      ])
      .onConflictDoNothing();

    await transaction
      .insert(operatorRoles)
      .values([
        { operatorId: ids.operators.lena, roleId: ids.roles.lead },
        { operatorId: ids.operators.omar, roleId: ids.roles.analyst },
        { operatorId: ids.operators.priya, roleId: ids.roles.analyst },
      ])
      .onConflictDoNothing();

    await transaction
      .insert(protectees)
      .values([
        {
          id: ids.protectees.avery,
          workspaceId: workspace.id,
          displayName: "Avery Chen",
          title: "Chief Executive Officer",
          organization: "Northstar Labs",
          tier: "critical",
        },
        {
          id: ids.protectees.maya,
          workspaceId: workspace.id,
          displayName: "Maya Rodriguez",
          title: "Executive Vice President",
          organization: "Meridian Research",
          tier: "high",
        },
        {
          id: ids.protectees.elias,
          workspaceId: workspace.id,
          displayName: "Elias Morgan",
          title: "Board Member",
          organization: "Redstone Foundation",
          tier: "standard",
        },
      ])
      .onConflictDoNothing();

    await transaction
      .insert(protecteeIdentities)
      .values([
        {
          id: ids.identities.avery,
          workspaceId: workspace.id,
          protecteeId: ids.protectees.avery,
          type: "work_email",
          displayValue: "avery.chen@northstar.example",
          normalizedValue: "avery.chen@northstar.example",
          isPrimary: true,
          verifiedAt: new Date("2026-08-01T12:00:00.000Z"),
        },
        {
          id: ids.identities.maya,
          workspaceId: workspace.id,
          protecteeId: ids.protectees.maya,
          type: "work_email",
          displayValue: "maya.rodriguez@meridian.example",
          normalizedValue: "maya.rodriguez@meridian.example",
          isPrimary: true,
          verifiedAt: new Date("2026-08-02T12:00:00.000Z"),
        },
        {
          id: ids.identities.elias,
          workspaceId: workspace.id,
          protecteeId: ids.protectees.elias,
          type: "personal_email",
          displayValue: "elias.morgan@example.test",
          normalizedValue: "elias.morgan@example.test",
          isPrimary: true,
          verifiedAt: new Date("2026-08-03T12:00:00.000Z"),
        },
      ])
      .onConflictDoNothing();

    await transaction
      .insert(protecteeLocations)
      .values([
        {
          id: ids.locations.avery,
          protecteeId: ids.protectees.avery,
          label: "New York, NY",
          latitude: 40.7128,
          longitude: -74.006,
          precision: "city",
        },
        {
          id: ids.locations.maya,
          protecteeId: ids.protectees.maya,
          label: "London, United Kingdom",
          latitude: 51.5072,
          longitude: -0.1276,
          precision: "city",
        },
        {
          id: ids.locations.elias,
          protecteeId: ids.protectees.elias,
          label: "Singapore",
          latitude: 1.3521,
          longitude: 103.8198,
          precision: "city",
        },
      ])
      .onConflictDoNothing();

    await transaction
      .insert(exposureSources)
      .values([
        {
          id: ids.sources.stealer,
          workspaceId: workspace.id,
          type: "infostealer",
          name: "Synthetic RedLine collection",
          sourceRecordId: "DEMO-STEALER-001",
          observedAt: observedAt.stealer,
          confidence: "confirmed",
          notes:
            "Synthetic demonstration source. No real person or breach data.",
          createdByOperatorId: ids.operators.omar,
        },
        {
          id: ids.sources.breach,
          workspaceId: workspace.id,
          type: "breach",
          name: "Synthetic vendor portal breach",
          sourceRecordId: "DEMO-BREACH-014",
          observedAt: observedAt.breach,
          confidence: "high",
          notes:
            "Synthetic demonstration source. No real person or breach data.",
          createdByOperatorId: ids.operators.priya,
        },
        {
          id: ids.sources.phishing,
          workspaceId: workspace.id,
          type: "phishing",
          name: "Synthetic credential phishing report",
          sourceRecordId: "DEMO-PHISH-008",
          observedAt: observedAt.phishing,
          confidence: "medium",
          notes:
            "Synthetic demonstration source. No real person or breach data.",
          createdByOperatorId: ids.operators.omar,
        },
      ])
      .onConflictDoNothing();

    const exposureFixtures = [
      {
        id: ids.exposures.avery,
        sourceId: ids.sources.stealer,
        identityType: "work_email" as const,
        identityValue: "avery.chen@northstar.example",
        credentialKind: "session_cookie" as const,
        secret: "DEMO-ONLY-SESSION-COOKIE-AVERY",
        service: "Northstar Identity",
        serviceDomain: "id.northstar.example",
        sourceType: "infostealer" as const,
        sourceName: "Synthetic RedLine collection",
        sourceRecordId: "DEMO-STEALER-001",
        observedAt: observedAt.stealer,
        severity: "critical" as const,
        confidence: "confirmed" as const,
        operatorId: ids.operators.omar,
      },
      {
        id: ids.exposures.maya,
        sourceId: ids.sources.breach,
        identityType: "work_email" as const,
        identityValue: "maya.rodriguez@meridian.example",
        credentialKind: "password" as const,
        secret: "DEMO-ONLY-PASSWORD-MAYA",
        service: "Vendor Travel Portal",
        serviceDomain: "travel.vendor.example",
        sourceType: "breach" as const,
        sourceName: "Synthetic vendor portal breach",
        sourceRecordId: "DEMO-BREACH-014",
        observedAt: observedAt.breach,
        severity: "high" as const,
        confidence: "high" as const,
        operatorId: ids.operators.priya,
      },
      {
        id: ids.exposures.elias,
        sourceId: ids.sources.phishing,
        identityType: "personal_email" as const,
        identityValue: "elias.morgan@example.test",
        credentialKind: "password_hash" as const,
        secret: "DEMO-ONLY-HASH-ELIAS",
        service: "Personal Mail",
        serviceDomain: "mail.example.test",
        sourceType: "phishing" as const,
        sourceName: "Synthetic credential phishing report",
        sourceRecordId: "DEMO-PHISH-008",
        observedAt: observedAt.phishing,
        severity: "medium" as const,
        confidence: "medium" as const,
        operatorId: ids.operators.omar,
      },
    ];

    for (const fixture of exposureFixtures) {
      const normalizedIdentity = normalizeIdentity(
        fixture.identityType,
        fixture.identityValue,
      );
      const fingerprint = fingerprintSecret(
        fixture.secret,
        cryptoConfig.dataKey,
      );
      const encrypted = encryptSecret(
        fixture.secret,
        cryptoConfig.dataKey,
        cryptoConfig.keyVersion,
      );
      const dedupeKey = buildExposureDedupeKey({
        identityType: fixture.identityType,
        normalizedIdentity,
        credentialKind: fixture.credentialKind,
        credentialFingerprint: fingerprint,
        service: fixture.service,
        serviceDomain: fixture.serviceDomain,
        sourceType: fixture.sourceType,
        sourceName: fixture.sourceName,
        sourceRecordId: fixture.sourceRecordId,
        observedAt: fixture.observedAt,
      });

      await transaction
        .insert(credentialExposures)
        .values({
          id: fixture.id,
          workspaceId: workspace.id,
          sourceId: fixture.sourceId,
          exposedIdentityType: fixture.identityType,
          exposedIdentityDisplay: fixture.identityValue,
          exposedIdentityNormalized: normalizedIdentity,
          service: fixture.service,
          serviceDomain: fixture.serviceDomain,
          credentialKind: fixture.credentialKind,
          credentialCiphertext: encrypted.ciphertext,
          credentialIv: encrypted.iv,
          credentialAuthTag: encrypted.authTag,
          credentialKeyVersion: encrypted.keyVersion,
          credentialFingerprint: fingerprint,
          credentialLength: fixture.secret.length,
          dedupeKey,
          observedAt: fixture.observedAt,
          severity: fixture.severity,
          confidence: fixture.confidence,
          verification: "confirmed",
          status: "in_case",
          notes: "Synthetic credential. Safe for demonstration only.",
          createdByOperatorId: fixture.operatorId,
        })
        .onConflictDoNothing();
    }

    await transaction
      .insert(exposureMatches)
      .values([
        {
          id: ids.matches.avery,
          exposureId: ids.exposures.avery,
          protecteeId: ids.protectees.avery,
          identityId: ids.identities.avery,
          method: "exact",
          confidence: "confirmed",
          confirmedByOperatorId: ids.operators.omar,
          confirmedAt: observedAt.stealer,
        },
        {
          id: ids.matches.maya,
          exposureId: ids.exposures.maya,
          protecteeId: ids.protectees.maya,
          identityId: ids.identities.maya,
          method: "exact",
          confidence: "high",
          confirmedByOperatorId: ids.operators.priya,
          confirmedAt: observedAt.breach,
        },
        {
          id: ids.matches.elias,
          exposureId: ids.exposures.elias,
          protecteeId: ids.protectees.elias,
          identityId: ids.identities.elias,
          method: "exact",
          confidence: "medium",
          confirmedByOperatorId: ids.operators.omar,
          confirmedAt: observedAt.phishing,
        },
      ])
      .onConflictDoNothing();

    await transaction
      .insert(responseCases)
      .values([
        {
          id: ids.cases.avery,
          workspaceId: workspace.id,
          protecteeId: ids.protectees.avery,
          title: "Active Northstar session exposed",
          status: "remediating",
          priority: "critical",
          assigneeOperatorId: ids.operators.lena,
          dueAt: new Date("2026-08-18T17:30:00.000Z"),
          openedAt: observedAt.stealer,
        },
        {
          id: ids.cases.maya,
          workspaceId: workspace.id,
          protecteeId: ids.protectees.maya,
          title: "Vendor portal password exposed",
          status: "investigating",
          priority: "high",
          assigneeOperatorId: ids.operators.priya,
          dueAt: new Date("2026-08-19T14:00:00.000Z"),
          openedAt: observedAt.breach,
        },
        {
          id: ids.cases.elias,
          workspaceId: workspace.id,
          protecteeId: ids.protectees.elias,
          title: "Personal mail hash under review",
          status: "monitoring",
          priority: "medium",
          assigneeOperatorId: ids.operators.omar,
          dueAt: new Date("2026-08-20T16:00:00.000Z"),
          openedAt: observedAt.phishing,
        },
      ])
      .onConflictDoNothing();

    await transaction
      .insert(caseExposures)
      .values([
        {
          caseId: ids.cases.avery,
          exposureId: ids.exposures.avery,
          attachedByOperatorId: ids.operators.omar,
        },
        {
          caseId: ids.cases.maya,
          exposureId: ids.exposures.maya,
          attachedByOperatorId: ids.operators.priya,
        },
        {
          caseId: ids.cases.elias,
          exposureId: ids.exposures.elias,
          attachedByOperatorId: ids.operators.omar,
        },
      ])
      .onConflictDoNothing();

    await transaction
      .insert(caseTasks)
      .values([
        {
          id: ids.tasks.averyRevoke,
          caseId: ids.cases.avery,
          type: "revoke_sessions",
          title: "Revoke active Northstar sessions",
          status: "in_progress",
          assigneeOperatorId: ids.operators.lena,
          dueAt: new Date("2026-08-18T17:00:00.000Z"),
        },
        {
          id: ids.tasks.averyReset,
          caseId: ids.cases.avery,
          type: "password_reset",
          title: "Rotate Northstar identity password",
          assigneeOperatorId: ids.operators.omar,
          dueAt: new Date("2026-08-18T17:15:00.000Z"),
        },
        {
          id: ids.tasks.mayaReset,
          caseId: ids.cases.maya,
          type: "password_reset",
          title: "Reset vendor portal password",
          assigneeOperatorId: ids.operators.priya,
          dueAt: new Date("2026-08-19T12:00:00.000Z"),
        },
        {
          id: ids.tasks.eliasVerify,
          caseId: ids.cases.elias,
          type: "verify",
          title: "Confirm whether the hash remains active",
          assigneeOperatorId: ids.operators.omar,
          dueAt: new Date("2026-08-20T15:00:00.000Z"),
        },
      ])
      .onConflictDoNothing();

    await transaction
      .insert(communications)
      .values({
        id: ids.communication,
        caseId: ids.cases.avery,
        channel: "phone",
        status: "planned",
        recipientLabel: "Avery Chen",
        subject: "Urgent credential remediation",
        createdByOperatorId: ids.operators.lena,
      })
      .onConflictDoNothing();

    await transaction
      .insert(activityLog)
      .values([
        {
          id: ids.activity.averyExposure,
          workspaceId: workspace.id,
          actorOperatorId: ids.operators.omar,
          action: "exposure.created",
          entityType: "credential_exposure",
          entityId: ids.exposures.avery,
          summary: "Session cookie exposure recorded for Avery Chen.",
          occurredAt: observedAt.stealer,
        },
        {
          id: ids.activity.averyCase,
          workspaceId: workspace.id,
          actorOperatorId: ids.operators.lena,
          action: "case.status_changed",
          entityType: "response_case",
          entityId: ids.cases.avery,
          summary: "Case moved to remediation.",
          occurredAt: new Date("2026-08-18T14:05:00.000Z"),
        },
        {
          id: ids.activity.mayaExposure,
          workspaceId: workspace.id,
          actorOperatorId: ids.operators.priya,
          action: "exposure.created",
          entityType: "credential_exposure",
          entityId: ids.exposures.maya,
          summary: "Password exposure recorded for Maya Rodriguez.",
          occurredAt: observedAt.breach,
        },
      ])
      .onConflictDoNothing();
  });

  const [workspaceCount] = await database
    .select({ count: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspace.id));

  if (!workspaceCount) {
    throw new Error("CredSignal seed verification failed.");
  }
}

seed()
  .then(() => {
    process.stdout.write("CredSignal synthetic demo data is ready.\n");
  })
  .finally(async () => {
    await closeDatabase();
  });
