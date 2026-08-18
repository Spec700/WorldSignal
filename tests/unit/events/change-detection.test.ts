import { describe, expect, it } from "vitest";

import {
  classifyEventChanges,
  updateSuccessfulSourceBaseline,
} from "@/lib/events/change-detection";
import { cycloneFixture, earthquakeFixture } from "../../fixtures/events";

describe("session event change detection", () => {
  it("classifies new, unchanged, updated, and explicitly resolved events", () => {
    const updated = {
      ...earthquakeFixture,
      revisionFingerprint: "revised",
    };
    const resolved = {
      ...cycloneFixture,
      lifecycle: "ended" as const,
      endedAt: "2026-08-18T10:00:00.000Z",
      revisionFingerprint: "ended-revision",
    };
    const previous = new Map([
      [earthquakeFixture.id, earthquakeFixture],
      [cycloneFixture.id, cycloneFixture],
    ]);

    expect(
      classifyEventChanges(previous, [earthquakeFixture]).get(
        earthquakeFixture.id,
      ),
    ).toBe("unchanged");
    expect(classifyEventChanges(previous, [updated]).get(updated.id)).toBe(
      "updated",
    );
    expect(classifyEventChanges(previous, [resolved]).get(resolved.id)).toBe(
      "resolved",
    );
    expect(
      classifyEventChanges(new Map(), [earthquakeFixture]).get(
        earthquakeFixture.id,
      ),
    ).toBe("new");
  });

  it("does not invent a resolved event when an ID disappears", () => {
    const changes = classifyEventChanges(
      new Map([[earthquakeFixture.id, earthquakeFixture]]),
      [],
    );

    expect(changes.size).toBe(0);
  });

  it("keeps a failed source baseline without retaining its event in the display batch", () => {
    const previous = new Map([
      [earthquakeFixture.id, earthquakeFixture],
      [cycloneFixture.id, cycloneFixture],
    ]);
    const nextBaseline = updateSuccessfulSourceBaseline(
      previous,
      [{ ...earthquakeFixture, revisionFingerprint: "usgs-next" }],
      new Set(["usgs"]),
    );

    expect(nextBaseline.get(earthquakeFixture.id)?.revisionFingerprint).toBe(
      "usgs-next",
    );
    expect(nextBaseline.get(cycloneFixture.id)).toBe(cycloneFixture);
  });
});
