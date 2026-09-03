import { SourceFetchError } from "./errors";

export type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface FetchSourceOptions {
  signal: AbortSignal;
  timeoutMs: number;
  maxBytes: number;
  sourceLabel: string;
  allowNoContent?: boolean;
  fetchImplementation?: FetchImplementation;
}

interface FetchBodyOptions extends FetchSourceOptions {
  accept: string;
  acceptedContentTypes: string[];
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
  options: FetchSourceOptions,
): Promise<unknown> {
  const bytes = await fetchBoundedSourceBody(url, {
    ...options,
    accept: "application/json, application/geo+json",
    acceptedContentTypes: ["json", "geo+json"],
  });

  if (bytes === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new SourceFetchError(
      "schema",
      `${options.sourceLabel} returned malformed JSON.`,
      {
        cause: error,
      },
    );
  }
}

export async function fetchText(
  url: URL,
  options: Omit<FetchSourceOptions, "allowNoContent">,
): Promise<string> {
  const bytes = await fetchBoundedSourceBody(url, {
    ...options,
    accept: "text/csv",
    acceptedContentTypes: ["text/csv"],
  });

  if (!bytes || bytes.byteLength === 0) {
    throw new SourceFetchError(
      "schema",
      `${options.sourceLabel} returned an empty response without data.`,
    );
  }

  return new TextDecoder().decode(bytes);
}

async function fetchBoundedSourceBody(
  url: URL,
  {
    signal,
    timeoutMs,
    maxBytes,
    sourceLabel,
    allowNoContent = false,
    fetchImplementation = fetch,
    accept,
    acceptedContentTypes,
  }: FetchBodyOptions,
): Promise<Uint8Array | undefined> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combinedSignal = AbortSignal.any([signal, timeoutSignal]);
  let response: Response;

  try {
    response = await fetchImplementation(url, {
      cache: "no-store",
      headers: {
        Accept: accept,
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
      { httpStatus: response.status },
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
  if (!acceptedContentTypes.some((type) => contentType.includes(type))) {
    throw new SourceFetchError(
      "schema",
      `${sourceLabel} returned an unsupported content type.`,
    );
  }

  try {
    return await readBoundedBody(response, maxBytes);
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
}
