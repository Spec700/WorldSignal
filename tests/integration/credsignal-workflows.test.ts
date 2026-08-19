// @vitest-environment node

import { eq, inArray } from "drizzle-orm";

import { getCredSignalDashboard } from "@/features/credsignal/server/dashboard";
import {
  createCaseCommunication,
  createCaseTask,
  createExposure,
  CredSignalConflictError,
  CredSignalWorkflowError,
  manuallyMatchExposure,
  revealCredential,
  transitionCase,
  transitionCaseCommunication,
  transitionTask,
  updateCaseCoordination,
  updateCaseTask,
} from "@/features/credsignal/server/workflows";
import {
  addPersonIdentity,
  createPerson,
  deactivatePersonIdentity,
  PeopleWorkflowError,
  replacePersonLocation,
  setPrimaryPersonIdentity,
  updatePerson,
} from "@/features/people/server/workflows";
import { closeDatabase, getDatabase } from "@/lib/db/client";
import {
  caseExposures,
  credentialExposures,
  operators,
  responseCases,
  workspaces,
} from "@/lib/db/schema";

const runDatabaseTests = process.env.RUN_CREDSIGNAL_DB_TESTS === "1";
const describeDatabase = runDatabaseTests ? describe : describe.skip;

describeDatabase("CredSignal PostgreSQL workflows", () => {
  const workspaceSlug = `credsignal-integration-${process.pid}`;
  const dataKey = Buffer.alloc(32, 23).toString("base64");
  let workspaceId = "";
  let operatorId = "";
  let secondaryOperatorId = "";

  beforeAll(async () => {
    process.env.CREDSIGNAL_WORKSPACE_SLUG = workspaceSlug;
    if (!process.env.CREDSIGNAL_DATA_KEY_FILE) {
      process.env.CREDSIGNAL_DATA_KEY = dataKey;
    }
    process.env.CREDSIGNAL_KEY_VERSION = "integration-v1";

    const database = getDatabase();
    const [workspace] = await database
      .insert(workspaces)
      .values({ name: "CredSignal Integration", slug: workspaceSlug })
      .returning();
    workspaceId = workspace.id;
    const [operator] = await database
      .insert(operators)
      .values({
        workspaceId,
        displayName: "Integration Analyst",
        email: `analyst-${process.pid}@integration.example`,
      })
      .returning();
    operatorId = operator.id;
    const [secondaryOperator] = await database
      .insert(operators)
      .values({
        workspaceId,
        displayName: "Secondary Integration Analyst",
        email: `secondary-analyst-${process.pid}@integration.example`,
      })
      .returning();
    secondaryOperatorId = secondaryOperator.id;
  });

  afterAll(async () => {
    const database = getDatabase();
    if (workspaceId) {
      const workspaceCases = await database
        .select({ id: responseCases.id })
        .from(responseCases)
        .where(eq(responseCases.workspaceId, workspaceId));
      if (workspaceCases.length > 0) {
        await database.delete(caseExposures).where(
          inArray(
            caseExposures.caseId,
            workspaceCases.map((entry) => entry.id),
          ),
        );
      }
      await database
        .delete(credentialExposures)
        .where(eq(credentialExposures.workspaceId, workspaceId));
      await database.delete(workspaces).where(eq(workspaces.id, workspaceId));
    }
    await closeDatabase();
  });

  it("persists the full protectee, exposure, case, task, reveal, and closure chain", async () => {
    const protecteeResult = await createPerson(
      {
        displayName: "Integration Protectee",
        title: "Chief Test Officer",
        organization: "Integration Labs",
        tier: "high",
        identityType: "work_email",
        identityValue: "protectee@integration.example",
        locationLabel: "Test City",
        latitude: 38.9072,
        longitude: -77.0369,
      },
      operatorId,
    );

    const exposureInput = {
      protecteeId: protecteeResult.personId,
      identityType: "work_email" as const,
      identityValue: "protectee@integration.example",
      credentialKind: "session_token" as const,
      credentialValue: "INTEGRATION-ONLY-SESSION-TOKEN",
      service: "Integration Identity",
      serviceDomain: "identity.integration.example",
      sourceType: "internal_report" as const,
      sourceName: "Integration source",
      sourceRecordId: `integration-${process.pid}`,
      observedAt: new Date("2026-08-18T16:00:00.000Z"),
      confidence: "confirmed" as const,
      notes: "Synthetic integration record.",
    };
    const exposureResult = await createExposure(exposureInput, operatorId);

    expect(exposureResult.caseId).toBeDefined();
    expect(exposureResult.matchedProtecteeId).toBe(protecteeResult.personId);
    await expect(
      createExposure(exposureInput, operatorId),
    ).rejects.toBeInstanceOf(CredSignalConflictError);

    const dashboard = await getCredSignalDashboard();
    const protectee = dashboard.protectees.find(
      (entry) => entry.id === protecteeResult.personId,
    );
    const responseCase = protectee?.cases[0];
    const task = responseCase?.tasks[0];

    expect(dashboard.setupRequired).toBe(false);
    expect(protectee?.activePriority).toBe("critical");
    expect(protectee?.exposures[0]?.hasCredentialValue).toBe(true);
    expect(responseCase?.status).toBe("open");
    expect(task).toBeDefined();
    expect(await revealCredential(exposureResult.exposureId, operatorId)).toBe(
      "INTEGRATION-ONLY-SESSION-TOKEN",
    );

    const communication = await createCaseCommunication(
      {
        caseId: responseCase!.id,
        channel: "phone",
        recipientLabel: "Integration Protectee",
        subject: "Credential response coordination",
        body: "Synthetic notification record for integration testing.",
        status: "planned",
      },
      operatorId,
    );
    await transitionCaseCommunication(
      communication.communicationId,
      "sent",
      operatorId,
    );
    await transitionCaseCommunication(
      communication.communicationId,
      "acknowledged",
      operatorId,
    );
    await expect(
      transitionCaseCommunication(
        communication.communicationId,
        "planned",
        operatorId,
      ),
    ).rejects.toBeInstanceOf(CredSignalWorkflowError);

    const updatedCaseDueAt = new Date("2026-08-19T20:00:00.000Z");
    await updateCaseCoordination(
      {
        caseId: responseCase!.id,
        assigneeOperatorId: secondaryOperatorId,
        priority: "high",
        dueAt: updatedCaseDueAt,
      },
      operatorId,
    );
    const addedTask = await createCaseTask(
      {
        caseId: responseCase!.id,
        type: "enable_mfa",
        title: "Require phishing-resistant MFA",
        assigneeOperatorId: secondaryOperatorId,
        dueAt: new Date("2026-08-19T18:00:00.000Z"),
        notes: "Synthetic coordination note.",
      },
      operatorId,
    );
    await updateCaseTask(
      {
        taskId: addedTask.taskId,
        assigneeOperatorId: operatorId,
        dueAt: new Date("2026-08-19T19:00:00.000Z"),
        notes: "Updated synthetic coordination note.",
      },
      operatorId,
    );

    await transitionCase(
      responseCase!.id,
      "investigating",
      undefined,
      operatorId,
    );
    await transitionCase(
      responseCase!.id,
      "remediating",
      undefined,
      operatorId,
    );
    await expect(
      transitionCase(
        responseCase!.id,
        "closed",
        "This closure must wait for active tasks.",
        operatorId,
      ),
    ).rejects.toBeInstanceOf(CredSignalWorkflowError);

    await transitionTask(addedTask.taskId, "in_progress", operatorId);
    await transitionTask(addedTask.taskId, "completed", operatorId);
    await expect(
      transitionTask(addedTask.taskId, "cancelled", operatorId),
    ).rejects.toBeInstanceOf(CredSignalWorkflowError);
    for (const responseTask of responseCase!.tasks) {
      await transitionTask(responseTask.id, "completed", operatorId);
    }
    await transitionCase(
      responseCase!.id,
      "closed",
      "Sessions revoked and credential rotated.",
      operatorId,
    );

    const closedDashboard = await getCredSignalDashboard();
    const closedProtectee = closedDashboard.protectees.find(
      (entry) => entry.id === protecteeResult.personId,
    );

    expect(closedProtectee?.cases[0]?.status).toBe("closed");
    expect(closedProtectee?.cases[0]).toMatchObject({
      assigneeId: secondaryOperatorId,
      assigneeName: "Secondary Integration Analyst",
      dueAt: updatedCaseDueAt.toISOString(),
      priority: "high",
    });
    expect(closedProtectee?.exposures[0]?.status).toBe("remediated");
    expect(
      closedProtectee?.cases[0]?.tasks.find((entry) => entry.id === task!.id)
        ?.status,
    ).toBe("completed");
    expect(
      closedProtectee?.cases[0]?.tasks.find(
        (entry) => entry.id === addedTask.taskId,
      ),
    ).toMatchObject({
      assigneeId: operatorId,
      assigneeName: "Integration Analyst",
      notes: "Updated synthetic coordination note.",
      status: "completed",
    });
    expect(closedProtectee?.cases[0]?.communications[0]).toMatchObject({
      id: communication.communicationId,
      channel: "phone",
      recipientLabel: "Integration Protectee",
      status: "acknowledged",
    });
    expect(closedProtectee?.cases[0]?.communications[0]?.sentAt).toBeDefined();
    expect(
      closedProtectee?.cases[0]?.communications[0]?.acknowledgedAt,
    ).toBeDefined();
    expect(
      closedDashboard.recentActivity.some(
        (activity) => activity.action === "credential.revealed",
      ),
    ).toBe(true);
    expect(
      closedDashboard.recentActivity.some(
        (activity) => activity.action === "communication.status_changed",
      ),
    ).toBe(true);
    await expect(
      createCaseCommunication(
        {
          caseId: responseCase!.id,
          channel: "email",
          recipientLabel: "Integration Protectee",
          subject: "Closed case notification",
          body: "This must not be added to a closed case.",
          status: "draft",
        },
        operatorId,
      ),
    ).rejects.toBeInstanceOf(CredSignalWorkflowError);
    await expect(
      createCaseTask(
        {
          caseId: responseCase!.id,
          type: "verify",
          title: "Closed case task",
          assigneeOperatorId: operatorId,
          notes: "This must not be added to a closed case.",
        },
        operatorId,
      ),
    ).rejects.toBeInstanceOf(CredSignalWorkflowError);
    await expect(
      transitionTask(task!.id, "in_progress", operatorId),
    ).rejects.toBeInstanceOf(CredSignalWorkflowError);
  });

  it("moves an unmatched exposure into a manually confirmed protectee case", async () => {
    const protecteeResult = await createPerson(
      {
        displayName: "Manual Match Protectee",
        title: "Chief Alias Officer",
        organization: "Integration Labs",
        tier: "standard",
        identityType: "work_email",
        identityValue: "manual-match@integration.example",
        locationLabel: "Alias City",
        latitude: 51.5072,
        longitude: -0.1276,
      },
      operatorId,
    );
    const exposureResult = await createExposure(
      {
        identityType: "username",
        identityValue: "manual-match-alias",
        credentialKind: "password",
        credentialValue: "INTEGRATION-ONLY-MANUAL-PASSWORD",
        service: "Alias Identity",
        serviceDomain: "alias.integration.example",
        sourceType: "internal_report",
        sourceName: "Manual match integration source",
        sourceRecordId: `manual-match-${process.pid}`,
        observedAt: new Date("2026-08-18T17:00:00.000Z"),
        confidence: "high",
        notes: "Synthetic unmatched integration record.",
      },
      operatorId,
    );

    const unmatchedDashboard = await getCredSignalDashboard();
    const protectee = unmatchedDashboard.protectees.find(
      (entry) => entry.id === protecteeResult.personId,
    );
    expect(
      unmatchedDashboard.unmatchedExposures.some(
        (entry) => entry.id === exposureResult.exposureId,
      ),
    ).toBe(true);

    const result = await manuallyMatchExposure(
      {
        exposureId: exposureResult.exposureId,
        protecteeId: protecteeResult.personId,
        identityId: protectee!.identities[0].id,
        reason:
          "The source record links this alias to the protectee's approved work identity.",
      },
      operatorId,
    );

    expect(result.protecteeId).toBe(protecteeResult.personId);
    expect(result.caseId).toBeDefined();
    await expect(
      manuallyMatchExposure(
        {
          exposureId: exposureResult.exposureId,
          protecteeId: protecteeResult.personId,
          identityId: protectee!.identities[0].id,
          reason: "A duplicate manual decision must not be accepted.",
        },
        operatorId,
      ),
    ).rejects.toBeInstanceOf(CredSignalConflictError);

    const matchedDashboard = await getCredSignalDashboard();
    const matchedProtectee = matchedDashboard.protectees.find(
      (entry) => entry.id === protecteeResult.personId,
    );
    expect(
      matchedDashboard.unmatchedExposures.some(
        (entry) => entry.id === exposureResult.exposureId,
      ),
    ).toBe(false);
    expect(
      matchedProtectee?.exposures.some(
        (entry) => entry.id === exposureResult.exposureId,
      ),
    ).toBe(true);
    expect(matchedProtectee?.cases[0]?.status).toBe("open");
    expect(
      matchedDashboard.recentActivity.some(
        (activity) => activity.action === "exposure.manually_matched",
      ),
    ).toBe(true);

    await transitionCase(
      result.caseId,
      "dismissed",
      "Synthetic dismissal verifies automatic task cancellation.",
      operatorId,
    );
    const dismissedDashboard = await getCredSignalDashboard();
    const dismissedProtectee = dismissedDashboard.protectees.find(
      (entry) => entry.id === protecteeResult.personId,
    );
    expect(dismissedProtectee?.cases[0]?.status).toBe("dismissed");
    expect(
      dismissedProtectee?.cases[0]?.tasks.every(
        (task) => task.status === "cancelled",
      ),
    ).toBe(true);
    expect(dismissedProtectee?.exposures[0]?.status).toBe("dismissed");
  });

  it("maintains protectee profiles, identities, and location history", async () => {
    const protecteeResult = await createPerson(
      {
        displayName: "Roster Maintenance Protectee",
        title: "Original Title",
        organization: "Integration Labs",
        tier: "standard",
        identityType: "work_email",
        identityValue: "roster-maintenance@integration.example",
        locationLabel: "Original City",
        latitude: 34.0522,
        longitude: -118.2437,
      },
      operatorId,
    );
    const initialDashboard = await getCredSignalDashboard();
    const initialProtectee = initialDashboard.protectees.find(
      (entry) => entry.id === protecteeResult.personId,
    );
    const originalIdentity = initialProtectee!.identities[0];

    await updatePerson(
      {
        personId: protecteeResult.personId,
        displayName: "Updated Roster Protectee",
        title: "Updated Title",
        organization: "Updated Integration Labs",
        tier: "critical",
        status: "active",
      },
      operatorId,
    );
    const addedIdentity = await addPersonIdentity(
      {
        personId: protecteeResult.personId,
        type: "username",
        value: "roster-maintenance-alias",
        makePrimary: false,
      },
      operatorId,
    );
    await setPrimaryPersonIdentity(addedIdentity.identityId, operatorId);
    await deactivatePersonIdentity(originalIdentity.id, operatorId);
    await expect(
      deactivatePersonIdentity(addedIdentity.identityId, operatorId),
    ).rejects.toBeInstanceOf(PeopleWorkflowError);
    await replacePersonLocation(
      {
        personId: protecteeResult.personId,
        label: "Updated Region",
        latitude: 47.6062,
        longitude: -122.3321,
        precision: "region",
      },
      operatorId,
    );
    await updatePerson(
      {
        personId: protecteeResult.personId,
        displayName: "Updated Roster Protectee",
        title: "Updated Title",
        organization: "Updated Integration Labs",
        tier: "critical",
        status: "paused",
      },
      operatorId,
    );

    const exposureResult = await createExposure(
      {
        identityType: "username",
        identityValue: "roster-maintenance-alias",
        credentialKind: "api_key",
        credentialValue: "INTEGRATION-ONLY-PAUSED-KEY",
        service: "Paused protectee service",
        serviceDomain: "paused.integration.example",
        sourceType: "internal_report",
        sourceName: "Paused protectee integration source",
        sourceRecordId: `paused-protectee-${process.pid}`,
        observedAt: new Date("2026-08-18T18:00:00.000Z"),
        confidence: "confirmed",
        notes: "A paused protectee must not be matched automatically.",
      },
      operatorId,
    );
    expect(exposureResult.caseId).toBeUndefined();

    const updatedDashboard = await getCredSignalDashboard();
    const updatedProtectee = updatedDashboard.protectees.find(
      (entry) => entry.id === protecteeResult.personId,
    );
    expect(updatedProtectee).toMatchObject({
      displayName: "Updated Roster Protectee",
      title: "Updated Title",
      organization: "Updated Integration Labs",
      tier: "critical",
      status: "paused",
      location: {
        label: "Updated Region",
        precision: "region",
      },
    });
    expect(
      updatedProtectee?.identities.find(
        (identity) => identity.id === originalIdentity.id,
      ),
    ).toMatchObject({ isActive: false, isPrimary: false });
    expect(
      updatedProtectee?.identities.find(
        (identity) => identity.id === addedIdentity.identityId,
      ),
    ).toMatchObject({ isActive: true, isPrimary: true });
    expect(
      updatedDashboard.unmatchedExposures.some(
        (exposure) => exposure.id === exposureResult.exposureId,
      ),
    ).toBe(true);
    expect(
      updatedDashboard.recentActivity.some(
        (activity) => activity.action === "person.location_changed",
      ),
    ).toBe(true);
  });
});
