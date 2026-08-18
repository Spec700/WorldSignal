// @vitest-environment node

import { eq, inArray } from "drizzle-orm";

import { getCredSignalDashboard } from "@/features/credsignal/server/dashboard";
import {
  createExposure,
  createProtectee,
  CredSignalConflictError,
  manuallyMatchExposure,
  revealCredential,
  transitionCase,
  transitionTask,
} from "@/features/credsignal/server/workflows";
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

  beforeAll(async () => {
    process.env.CREDSIGNAL_WORKSPACE_SLUG = workspaceSlug;
    process.env.CREDSIGNAL_DATA_KEY = dataKey;
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
    const protecteeResult = await createProtectee(
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
      protecteeId: protecteeResult.protecteeId,
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
    expect(exposureResult.matchedProtecteeId).toBe(protecteeResult.protecteeId);
    await expect(
      createExposure(exposureInput, operatorId),
    ).rejects.toBeInstanceOf(CredSignalConflictError);

    const dashboard = await getCredSignalDashboard();
    const protectee = dashboard.protectees.find(
      (entry) => entry.id === protecteeResult.protecteeId,
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

    await transitionTask(task!.id, "completed", operatorId);
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
    await transitionCase(
      responseCase!.id,
      "closed",
      "Sessions revoked and credential rotated.",
      operatorId,
    );

    const closedDashboard = await getCredSignalDashboard();
    const closedProtectee = closedDashboard.protectees.find(
      (entry) => entry.id === protecteeResult.protecteeId,
    );

    expect(closedProtectee?.cases[0]?.status).toBe("closed");
    expect(closedProtectee?.exposures[0]?.status).toBe("remediated");
    expect(
      closedProtectee?.cases[0]?.tasks.find((entry) => entry.id === task!.id)
        ?.status,
    ).toBe("completed");
    expect(
      closedDashboard.recentActivity.some(
        (activity) => activity.action === "credential.revealed",
      ),
    ).toBe(true);
  });

  it("moves an unmatched exposure into a manually confirmed protectee case", async () => {
    const protecteeResult = await createProtectee(
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
      (entry) => entry.id === protecteeResult.protecteeId,
    );
    expect(
      unmatchedDashboard.unmatchedExposures.some(
        (entry) => entry.id === exposureResult.exposureId,
      ),
    ).toBe(true);

    const result = await manuallyMatchExposure(
      {
        exposureId: exposureResult.exposureId,
        protecteeId: protecteeResult.protecteeId,
        identityId: protectee!.identities[0].id,
        reason:
          "The source record links this alias to the protectee's approved work identity.",
      },
      operatorId,
    );

    expect(result.protecteeId).toBe(protecteeResult.protecteeId);
    expect(result.caseId).toBeDefined();
    await expect(
      manuallyMatchExposure(
        {
          exposureId: exposureResult.exposureId,
          protecteeId: protecteeResult.protecteeId,
          identityId: protectee!.identities[0].id,
          reason: "A duplicate manual decision must not be accepted.",
        },
        operatorId,
      ),
    ).rejects.toBeInstanceOf(CredSignalConflictError);

    const matchedDashboard = await getCredSignalDashboard();
    const matchedProtectee = matchedDashboard.protectees.find(
      (entry) => entry.id === protecteeResult.protecteeId,
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
  });
});
