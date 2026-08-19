import { describe, expect, it } from "vitest";

import {
  personPointTooltip,
  toPersonGlobePoints,
} from "@/components/people/person-globe-model";
import type { PersonDto } from "@/features/people/types";

const person: PersonDto = {
  id: "person-1",
  displayName: "Avery <Chen>",
  organization: "Northstar & Labs",
  tier: "critical",
  status: "active",
  identities: [],
  location: {
    id: "location-current",
    label: "London, United Kingdom",
    latitude: 51.5072,
    longitude: -0.1276,
    precision: "city",
    isActive: true,
    effectiveFrom: "2026-08-10T00:00:00.000Z",
  },
  locationHistory: [
    {
      id: "location-current",
      label: "London, United Kingdom",
      latitude: 51.5072,
      longitude: -0.1276,
      precision: "city",
      isActive: true,
      effectiveFrom: "2026-08-10T00:00:00.000Z",
    },
    {
      id: "location-previous",
      label: "New York, NY",
      latitude: 40.7128,
      longitude: -74.006,
      precision: "city",
      isActive: false,
      effectiveFrom: "2026-08-01T00:00:00.000Z",
      effectiveTo: "2026-08-10T00:00:00.000Z",
    },
  ],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-10T00:00:00.000Z",
};

describe("person globe model", () => {
  it("maps current approved locations for active people", () => {
    expect(toPersonGlobePoints([person])).toEqual([
      expect.objectContaining({
        kind: "person",
        id: "person-1",
        latitude: 51.5072,
        longitude: -0.1276,
        locationLabel: "London, United Kingdom",
        tier: "critical",
      }),
    ]);

    expect(toPersonGlobePoints([{ ...person, status: "paused" }])).toEqual([]);
    expect(toPersonGlobePoints([{ ...person, location: undefined }])).toEqual(
      [],
    );
  });

  it("resolves the approved location at a supplied timeline instant", () => {
    const [point] = toPersonGlobePoints([person], "2026-08-05T12:00:00.000Z");

    expect(point).toEqual(
      expect.objectContaining({
        locationLabel: "New York, NY",
        latitude: 40.7128,
        longitude: -74.006,
      }),
    );
    expect(toPersonGlobePoints([person], "2026-07-01T00:00:00.000Z")).toEqual(
      [],
    );
  });

  it("escapes operator-managed values in globe tooltips", () => {
    const [point] = toPersonGlobePoints([person]);
    const tooltip = personPointTooltip(point!);

    expect(tooltip).toContain("Avery &lt;Chen&gt;");
    expect(tooltip).toContain("Northstar &amp; Labs");
    expect(tooltip).not.toContain("Avery <Chen>");
  });
});
