import { describe, expect, it, vi } from "vitest";

import { SourceFetchError } from "@/lib/sources/errors";
import { retryTransientSourceRequest } from "@/lib/sources/retry";

describe("transient source request retry", () => {
  it.each(["network", "timeout"] as const)(
    "retries a transient %s failure within the configured attempt limit",
    async (code) => {
      const operation = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(
          new SourceFetchError(code, "Transient fixture failure."),
        )
        .mockResolvedValue("recovered");
      const sleep = vi.fn(async () => undefined);

      await expect(
        retryTransientSourceRequest(operation, {
          signal: new AbortController().signal,
          maxAttempts: 2,
          backoffMs: 250,
          sleep,
        }),
      ).resolves.toBe("recovered");

      expect(operation).toHaveBeenCalledTimes(2);
      expect(sleep).toHaveBeenCalledWith(250, expect.any(AbortSignal));
    },
  );

  it.each(["http", "schema", "truncated", "unknown"] as const)(
    "does not retry a non-transient %s failure",
    async (code) => {
      const failure = new SourceFetchError(code, "Permanent fixture failure.");
      const operation = vi.fn(async () => {
        throw failure;
      });
      const sleep = vi.fn(async () => undefined);

      await expect(
        retryTransientSourceRequest(operation, {
          signal: new AbortController().signal,
          maxAttempts: 3,
          sleep,
        }),
      ).rejects.toBe(failure);

      expect(operation).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    },
  );

  it("does not start another attempt after the caller aborts", async () => {
    const controller = new AbortController();
    const operation = vi.fn(async () => {
      controller.abort(new DOMException("Cancelled", "AbortError"));
      throw new SourceFetchError("network", "Transient fixture failure.");
    });

    await expect(
      retryTransientSourceRequest(operation, {
        signal: controller.signal,
        maxAttempts: 3,
        sleep: vi.fn(async () => undefined),
      }),
    ).rejects.toMatchObject({ code: "network" });

    expect(operation).toHaveBeenCalledTimes(1);
  });
});
