import type { SourceHealth } from "@/lib/events/types";

export type SourceErrorCode = NonNullable<SourceHealth["errorCode"]>;

export class SourceFetchError extends Error {
  readonly code: SourceErrorCode;
  readonly safeMessage: string;

  constructor(
    code: SourceErrorCode,
    safeMessage: string,
    options?: ErrorOptions,
  ) {
    super(safeMessage, options);
    this.name = "SourceFetchError";
    this.code = code;
    this.safeMessage = safeMessage;
  }
}

export function asSourceFetchError(error: unknown): SourceFetchError {
  if (error instanceof SourceFetchError) {
    return error;
  }

  return new SourceFetchError(
    "unknown",
    "The source returned an unexpected error.",
    error === undefined ? undefined : { cause: error },
  );
}
