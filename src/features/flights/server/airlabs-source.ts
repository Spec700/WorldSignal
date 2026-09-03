import { and, eq } from "drizzle-orm";

import { getDatabase } from "@/lib/db/client";
import { flightSourceStates } from "@/lib/db/schema";
import {
  AirLabsAdapter,
  type AirLabsFlightSnapshot,
  type AirLabsUsageSnapshot,
} from "@/lib/sources/airlabs/adapter";
import { getAirLabsConfiguration } from "@/lib/sources/airlabs/config";
import { AirLabsSourceError } from "@/lib/sources/airlabs/errors";

const PROVIDER = "airlabs";
export const AIRLABS_AUTOMATION_REQUEST_CAP = 800;
export const AIRLABS_TOTAL_REQUEST_CAP = 1_000;

export type AirLabsRequestKind = "automation" | "interactive";
export type AirLabsRequestDenial =
  "automation_reserve" | "local_monthly_cap" | "provider_paused";

export class AirLabsRequestDeniedError extends Error {
  readonly reason: AirLabsRequestDenial;

  constructor(reason: AirLabsRequestDenial, message: string) {
    super(message);
    this.name = "AirLabsRequestDeniedError";
    this.reason = reason;
  }
}

export interface AirLabsSourceStateDto {
  available: boolean;
  paused: boolean;
  pauseReason?: string;
  planType?: string;
  providerExpiresAt?: string;
  providerMonthlyLimit?: number;
  providerMonthlyUsed?: number;
  providerMonthlyRemaining?: number;
  automationRequestCount: number;
  automationRequestCap: number;
  interactiveRequestCount: number;
  lastRequestAt?: string;
  lastSuccessfulAt?: string;
  lastError?: string;
}

function utcMonthCycle(now: Date): { startedAt: Date; endsAt: Date } {
  return {
    startedAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    endsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

function validDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

async function reserveAirLabsRequest(options: {
  workspaceId: string;
  keyFingerprint: string;
  kind: AirLabsRequestKind;
  now: Date;
}) {
  const database = getDatabase();
  const cycle = utcMonthCycle(options.now);

  await database.transaction(async (transaction) => {
    await transaction
      .insert(flightSourceStates)
      .values({
        workspaceId: options.workspaceId,
        provider: PROVIDER,
        keyFingerprint: options.keyFingerprint,
        cycleStartedAt: cycle.startedAt,
        cycleEndsAt: cycle.endsAt,
      })
      .onConflictDoNothing();

    const [storedState] = await transaction
      .select()
      .from(flightSourceStates)
      .where(
        and(
          eq(flightSourceStates.workspaceId, options.workspaceId),
          eq(flightSourceStates.provider, PROVIDER),
        ),
      )
      .for("update")
      .limit(1);

    if (!storedState) {
      throw new AirLabsRequestDeniedError(
        "provider_paused",
        "AirLabs request accounting could not be initialized.",
      );
    }

    const keyChanged = storedState.keyFingerprint !== options.keyFingerprint;
    const cycleChanged =
      storedState.cycleStartedAt.getTime() !== cycle.startedAt.getTime();
    const automationRequestCount =
      keyChanged || cycleChanged ? 0 : storedState.automationRequestCount;
    const interactiveRequestCount =
      keyChanged || cycleChanged ? 0 : storedState.interactiveRequestCount;
    const quotaPauseCanReset =
      cycleChanged && storedState.pauseCode === "quota";
    const paused =
      !keyChanged && !quotaPauseCanReset && storedState.pausedAt !== null;

    if (paused) {
      throw new AirLabsRequestDeniedError(
        "provider_paused",
        storedState.pauseReason ??
          "AirLabs requests are paused until the API key or account is corrected.",
      );
    }

    if (
      options.kind === "automation" &&
      automationRequestCount >= AIRLABS_AUTOMATION_REQUEST_CAP
    ) {
      throw new AirLabsRequestDeniedError(
        "automation_reserve",
        "AirLabs automation is resting to preserve 200 requests for analyst lookups.",
      );
    }

    if (
      automationRequestCount + interactiveRequestCount >=
      AIRLABS_TOTAL_REQUEST_CAP
    ) {
      await transaction
        .update(flightSourceStates)
        .set({
          pausedAt: options.now,
          pauseCode: "quota",
          pauseReason:
            "AirLabs is paused because the local monthly request cap was reached.",
          updatedAt: options.now,
        })
        .where(eq(flightSourceStates.id, storedState.id));
      throw new AirLabsRequestDeniedError(
        "local_monthly_cap",
        "AirLabs is paused because the local monthly request cap was reached.",
      );
    }

    await transaction
      .update(flightSourceStates)
      .set({
        keyFingerprint: options.keyFingerprint,
        cycleStartedAt: cycle.startedAt,
        cycleEndsAt: cycle.endsAt,
        automationRequestCount:
          automationRequestCount + (options.kind === "automation" ? 1 : 0),
        interactiveRequestCount:
          interactiveRequestCount + (options.kind === "interactive" ? 1 : 0),
        ...(keyChanged || quotaPauseCanReset
          ? { pausedAt: null, pauseCode: null, pauseReason: null }
          : {}),
        lastRequestAt: options.now,
        updatedAt: options.now,
      })
      .where(eq(flightSourceStates.id, storedState.id));
  });
}

async function recordAirLabsSuccess(
  workspaceId: string,
  keyFingerprint: string,
  usage: AirLabsUsageSnapshot,
  now: Date,
) {
  const database = getDatabase();
  const providerExpiresAt = validDate(usage.expiresAt);
  const exhausted = usage.monthlyRemaining === 0;

  await database
    .update(flightSourceStates)
    .set({
      ...(usage.keyId !== undefined ? { providerKeyId: usage.keyId } : {}),
      ...(usage.planType ? { planType: usage.planType } : {}),
      ...(providerExpiresAt ? { providerExpiresAt } : {}),
      ...(usage.monthlyLimit !== undefined
        ? { providerMonthlyLimit: Math.round(usage.monthlyLimit) }
        : {}),
      ...(usage.monthlyUsed !== undefined
        ? { providerMonthlyUsed: Math.round(usage.monthlyUsed) }
        : {}),
      ...(usage.monthlyRemaining !== undefined
        ? { providerMonthlyRemaining: Math.round(usage.monthlyRemaining) }
        : {}),
      lastSuccessfulAt: now,
      lastError: null,
      ...(exhausted
        ? {
            pausedAt: now,
            pauseCode: "quota",
            pauseReason:
              "AirLabs is paused because the provider reports no monthly requests remaining.",
          }
        : {}),
      updatedAt: now,
    })
    .where(
      and(
        eq(flightSourceStates.workspaceId, workspaceId),
        eq(flightSourceStates.provider, PROVIDER),
        eq(flightSourceStates.keyFingerprint, keyFingerprint),
      ),
    );
}

async function recordAirLabsFailure(
  workspaceId: string,
  keyFingerprint: string,
  error: AirLabsSourceError,
  now: Date,
) {
  const database = getDatabase();
  const pauseCode = /quota|limit|http_429/i.test(error.providerCode ?? "")
    ? "quota"
    : (error.providerCode ?? "provider_rejected");
  await database
    .update(flightSourceStates)
    .set({
      lastError: error.safeMessage,
      ...(error.directive === "pause"
        ? {
            pausedAt: now,
            pauseCode,
            pauseReason: error.safeMessage,
          }
        : {}),
      updatedAt: now,
    })
    .where(
      and(
        eq(flightSourceStates.workspaceId, workspaceId),
        eq(flightSourceStates.provider, PROVIDER),
        eq(flightSourceStates.keyFingerprint, keyFingerprint),
      ),
    );
}

export async function fetchAirLabsFlightForWorkspace(options: {
  workspaceId: string;
  passengerFlightNumber: string;
  kind: AirLabsRequestKind;
  signal: AbortSignal;
  now?: Date;
  adapter?: AirLabsAdapter;
}): Promise<AirLabsFlightSnapshot> {
  const now = options.now ?? new Date();
  const adapter = options.adapter ?? new AirLabsAdapter();
  const keyFingerprint = adapter.keyFingerprint;

  await reserveAirLabsRequest({
    workspaceId: options.workspaceId,
    keyFingerprint,
    kind: options.kind,
    now,
  });

  try {
    const snapshot = await adapter.fetchFlight(
      options.passengerFlightNumber,
      options.signal,
    );
    await recordAirLabsSuccess(
      options.workspaceId,
      keyFingerprint,
      snapshot.usage,
      now,
    );
    return snapshot;
  } catch (error) {
    if (error instanceof AirLabsSourceError) {
      await recordAirLabsFailure(
        options.workspaceId,
        keyFingerprint,
        error,
        now,
      );
    }
    throw error;
  }
}

export async function getAirLabsSourceState(
  workspaceId: string,
): Promise<AirLabsSourceStateDto> {
  const database = getDatabase();
  let keyFingerprint: string | undefined;
  try {
    keyFingerprint = getAirLabsConfiguration().keyFingerprint;
  } catch {
    // The setup state below intentionally exposes no configuration details.
  }
  const [state] = await database
    .select()
    .from(flightSourceStates)
    .where(
      and(
        eq(flightSourceStates.workspaceId, workspaceId),
        eq(flightSourceStates.provider, PROVIDER),
      ),
    )
    .limit(1);

  const currentKey =
    keyFingerprint !== undefined && state?.keyFingerprint === keyFingerprint;
  const paused = currentKey && state.pausedAt !== null;

  return {
    available: keyFingerprint !== undefined && !paused,
    paused,
    ...(paused && state.pauseReason ? { pauseReason: state.pauseReason } : {}),
    ...(currentKey && state.planType ? { planType: state.planType } : {}),
    ...(currentKey && state.providerExpiresAt
      ? { providerExpiresAt: state.providerExpiresAt.toISOString() }
      : {}),
    ...(currentKey && state.providerMonthlyLimit !== null
      ? { providerMonthlyLimit: state.providerMonthlyLimit }
      : {}),
    ...(currentKey && state.providerMonthlyUsed !== null
      ? { providerMonthlyUsed: state.providerMonthlyUsed }
      : {}),
    ...(currentKey && state.providerMonthlyRemaining !== null
      ? { providerMonthlyRemaining: state.providerMonthlyRemaining }
      : {}),
    automationRequestCount: currentKey ? state.automationRequestCount : 0,
    automationRequestCap: AIRLABS_AUTOMATION_REQUEST_CAP,
    interactiveRequestCount: currentKey ? state.interactiveRequestCount : 0,
    ...(currentKey && state.lastRequestAt
      ? { lastRequestAt: state.lastRequestAt.toISOString() }
      : {}),
    ...(currentKey && state.lastSuccessfulAt
      ? { lastSuccessfulAt: state.lastSuccessfulAt.toISOString() }
      : {}),
    ...(currentKey && state.lastError ? { lastError: state.lastError } : {}),
  };
}
