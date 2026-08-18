import { describe, expect, it } from "vitest";

import {
  globePointTooltip,
  toGlobeEventPoints,
} from "@/components/globe/globe-model";
import { cycloneFixture, earthquakeFixture } from "../../fixtures/events";

describe("globe event model", () => {
  it("uses canonical coordinates and bounded priority encodings", () => {
    const [earthquake, cyclone] = toGlobeEventPoints([
      earthquakeFixture,
      cycloneFixture,
    ]);

    expect(earthquake).toMatchObject({
      id: earthquakeFixture.id,
      latitude: 38.322,
      longitude: 143.248,
      color: "#f2ad53",
      radius: 0.27,
    });
    expect(cyclone.radius).toBeGreaterThan(earthquake.radius);
    expect(cyclone.radius).toBeLessThanOrEqual(0.32);
  });

  it("escapes upstream text before returning an HTML tooltip", () => {
    const [point] = toGlobeEventPoints([
      {
        ...earthquakeFixture,
        title: '<img src=x onerror="alert(1)">',
        locationLabel: "A & B",
      },
    ]);
    const tooltip = globePointTooltip(point);

    expect(tooltip).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(tooltip).toContain("A &amp; B");
    expect(tooltip).not.toContain("<img");
  });
});
