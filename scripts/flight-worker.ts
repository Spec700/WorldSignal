import { closeDatabase } from "../src/lib/db/client";
import { pollTrackedFlights } from "../src/features/flights/server/polling";

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const MINIMUM_POLL_INTERVAL_MS = 10_000;

function getPollIntervalMs(): number {
  const configured = Number(process.env.FLIGHTSIGNAL_POLL_INTERVAL_MS);
  if (!Number.isFinite(configured)) {
    return DEFAULT_POLL_INTERVAL_MS;
  }
  return Math.max(MINIMUM_POLL_INTERVAL_MS, Math.floor(configured));
}

function waitForNextPoll(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timeout = setTimeout(resolve, delayMs);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

const shutdownController = new AbortController();
const requestShutdown = () => shutdownController.abort();
process.once("SIGINT", requestShutdown);
process.once("SIGTERM", requestShutdown);

async function run() {
  const pollIntervalMs = getPollIntervalMs();
  console.info("[FlightSignal worker] started", { pollIntervalMs });

  while (!shutdownController.signal.aborted) {
    try {
      const summary = await pollTrackedFlights({
        signal: shutdownController.signal,
      });
      if (summary.attempted > 0) {
        console.info("[FlightSignal worker] poll complete", summary);
      }
    } catch (error) {
      if (!shutdownController.signal.aborted) {
        console.error("[FlightSignal worker] polling cycle failed", {
          errorType: error instanceof Error ? error.name : typeof error,
        });
      }
    }

    await waitForNextPoll(pollIntervalMs, shutdownController.signal);
  }
}

try {
  await run();
} finally {
  await closeDatabase();
  console.info("[FlightSignal worker] stopped");
}
