import { SourceFetchError } from "./errors";

export type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface FetchJsonOptions {
  signal: AbortSignal;
  timeoutMs: number;
  maxBytes: number;
  sourceLabel: string;
  allowNoContent?: boolean;
  fetchImplementation?: FetchImplementation;
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length"));

  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new SourceFetchError(
      "schema",
      `The source response exceeded the ${maxBytes.toLocaleString()} byte safety limit.`,
    );
  }

  if (!response.body) {
    return new Uint8Array();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new SourceFetchError(
        "schema",
        `The source response exceeded the ${maxBytes.toLocaleString()} byte safety limit.`,
      );
    }
    chunks.push(value);
  }

  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}

export async function fetchJson(
  url: URL,
  {
    signal,
    timeoutMs,
    maxBytes,
    sourceLabel,
    allowNoContent = false,
    fetchImplementation = fetch,
  }: FetchJsonOptions,
): Promise<unknown> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combinedSignal = AbortSignal.any([signal, timeoutSignal]);
  let response: Response;

  try {
    response = await fetchImplementation(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json, application/geo+json",
      },
      signal: combinedSignal,
    });
  } catch (error) {
    if (timeoutSignal.aborted) {
      throw new SourceFetchError(
        "timeout",
        `${sourceLabel} did not respond before the request timed out.`,
        { cause: error },
      );
    }

    throw new SourceFetchError(
      "network",
      `${sourceLabel} could not be reached.`,
      {
        cause: error,
      },
    );
  }

  if (!response.ok) {
    throw new SourceFetchError(
      "http",
      `${sourceLabel} returned HTTP ${response.status}.`,
    );
  }

  if (response.status === 204) {
    if (allowNoContent) {
      return undefined;
    }

    throw new SourceFetchError(
      "schema",
      `${sourceLabel} returned an empty response without data.`,
    );
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("json") && !contentType.includes("geo+json")) {
    throw new SourceFetchError(
      "schema",
      `${sourceLabel} returned an unsupported content type.`,
    );
  }

  let bytes: Uint8Array;

  try {
    bytes = await readBoundedBody(response, maxBytes);
  } catch (error) {
    if (error instanceof SourceFetchError) {
      throw error;
    }

    if (timeoutSignal.aborted) {
      throw new SourceFetchError(
        "timeout",
        `${sourceLabel} did not finish before the request timed out.`,
        { cause: error },
      );
    }

    throw new SourceFetchError(
      "network",
      `${sourceLabel} disconnected before its response completed.`,
      { cause: error },
    );
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new SourceFetchError(
      "schema",
      `${sourceLabel} returned malformed JSON.`,
      {
        cause: error,
      },
    );
  }
}
