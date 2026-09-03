import type { SourceHealth } from "@/lib/events/types";

export type SourceErrorCode = NonNullable<SourceHealth["errorCode"]>;

interface SourceFetchErrorOptions extends ErrorOptions {
  httpStatus?: number;
}

export class SourceFetchError extends Error {
  readonly code: SourceErrorCode;
  readonly safeMessage: string;
  readonly httpStatus?: number;

  constructor(
    code: SourceErrorCode,
    safeMessage: string,
    options?: SourceFetchErrorOptions,
  ) {
    super(safeMessage, options);
    this.name = "SourceFetchError";
    this.code = code;
    this.safeMessage = safeMessage;
    this.httpStatus = options?.httpStatus;
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
