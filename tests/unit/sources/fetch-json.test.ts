import { describe, expect, it, vi } from "vitest";

import { fetchJson } from "@/lib/sources/fetch-json";

const sourceUrl = new URL("https://source.example/events");

function options(
  fetchImplementation: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>,
  overrides: Partial<Parameters<typeof fetchJson>[1]> = {},
) {
  return {
    signal: new AbortController().signal,
    timeoutMs: 100,
    maxBytes: 1_024,
    sourceLabel: "Fixture source",
    fetchImplementation,
    ...overrides,
  };
}

describe("bounded source JSON retrieval", () => {
  it("requests uncached JSON with an abort signal", async () => {
    const fetchImplementation = vi.fn(async () =>
      Response.json(
        { ok: true },
        { headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      fetchJson(sourceUrl, options(fetchImplementation)),
    ).resolves.toEqual({
      ok: true,
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      sourceUrl,
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("classifies a request timeout explicitly", async () => {
    const fetchImplementation = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            {
              once: true,
            },
          );
        }),
    );

    await expect(
      fetchJson(sourceUrl, options(fetchImplementation, { timeoutMs: 5 })),
    ).rejects.toMatchObject({ code: "timeout" });
  });

  it("classifies a timeout while reading the response body", async () => {
    const fetchImplementation = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const body = new ReadableStream({
          start(controller) {
            init?.signal?.addEventListener(
              "abort",
              () => controller.error(init.signal?.reason),
              { once: true },
            );
          },
        });
        return new Response(body, {
          headers: { "content-type": "application/json" },
        });
      },
    );

    await expect(
      fetchJson(sourceUrl, options(fetchImplementation, { timeoutMs: 5 })),
    ).rejects.toMatchObject({ code: "timeout" });
  });

  it("rejects HTTP failures and unsupported content types", async () => {
    await expect(
      fetchJson(
        sourceUrl,
        options(async () => new Response(null, { status: 503 })),
      ),
    ).rejects.toMatchObject({ code: "http" });

    await expect(
      fetchJson(
        sourceUrl,
        options(async () => new Response("not json", { status: 200 })),
      ),
    ).rejects.toMatchObject({ code: "schema" });
  });

  it("enforces the declared response-size ceiling", async () => {
    await expect(
      fetchJson(
        sourceUrl,
        options(
          async () =>
            new Response(JSON.stringify({ oversized: true }), {
              headers: {
                "content-length": "4096",
                "content-type": "application/json",
              },
            }),
          { maxBytes: 1_024 },
        ),
      ),
    ).rejects.toMatchObject({ code: "schema" });
  });

  it("allows HTTP 204 only when the caller opts into an empty-page sentinel", async () => {
    const noContent = async () => new Response(null, { status: 204 });

    await expect(
      fetchJson(sourceUrl, options(noContent)),
    ).rejects.toMatchObject({
      code: "schema",
    });
    await expect(
      fetchJson(sourceUrl, options(noContent, { allowNoContent: true })),
    ).resolves.toBeUndefined();
  });
});
