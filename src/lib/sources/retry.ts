import { asSourceFetchError } from "./errors";

export type RetrySleep = (
  delayMs: number,
  signal: AbortSignal,
) => Promise<void>;

interface TransientRetryOptions {
  signal: AbortSignal;
  maxAttempts?: number;
  backoffMs?: number;
  sleep?: RetrySleep;
}

const TRANSIENT_ERROR_CODES = new Set(["network", "timeout"]);

async function sleepWithAbort(
  delayMs: number,
  signal: AbortSignal,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);
    const handleAbort = () => {
      clearTimeout(timeout);
      reject(signal.reason);
    };

    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

export async function retryTransientSourceRequest<T>(
  operation: () => Promise<T>,
  {
    signal,
    maxAttempts = 2,
    backoffMs = 250,
    sleep = sleepWithAbort,
  }: TransientRetryOptions,
): Promise<T> {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError("Source retry attempts must be a positive integer");
  }
  if (!Number.isFinite(backoffMs) || backoffMs < 0) {
    throw new RangeError("Source retry backoff must be non-negative");
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const sourceError = asSourceFetchError(error);
      const canRetry =
        TRANSIENT_ERROR_CODES.has(sourceError.code) &&
        !signal.aborted &&
        attempt < maxAttempts;

      if (!canRetry) {
        throw sourceError;
      }

      try {
        await sleep(backoffMs * 2 ** (attempt - 1), signal);
      } catch {
        throw sourceError;
      }
    }
  }

  throw new Error("Source retry loop exhausted unexpectedly");
}
