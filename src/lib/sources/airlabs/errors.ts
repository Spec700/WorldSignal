import { SourceFetchError, type SourceErrorCode } from "../errors";

export type AirLabsFailureDirective = "backoff" | "not_found" | "pause";

export class AirLabsSourceError extends SourceFetchError {
  readonly directive: AirLabsFailureDirective;
  readonly providerCode?: string;

  constructor(
    code: SourceErrorCode,
    safeMessage: string,
    directive: AirLabsFailureDirective,
    providerCode?: string,
    options?: ErrorOptions,
  ) {
    super(code, safeMessage, options);
    this.name = "AirLabsSourceError";
    this.directive = directive;
    this.providerCode = providerCode;
  }
}

export function classifyAirLabsError(
  providerCode: string | undefined,
  providerMessage: string | undefined,
): AirLabsFailureDirective {
  const description =
    `${providerCode ?? ""} ${providerMessage ?? ""}`.toLowerCase();

  if (/not[ _-]?found|no[ _-]?data|unknown[ _-]?flight/.test(description)) {
    return "not_found";
  }

  if (
    /api[ _-]?key|access[ _-]?key|auth|credential|expired|inactive|restricted|forbidden|quota|limit|subscription|payment|billing/.test(
      description,
    )
  ) {
    return "pause";
  }

  return "backoff";
}
