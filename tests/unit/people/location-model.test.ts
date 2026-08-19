import {
  currentPersonLocation,
  personLocationAt,
} from "@/features/people/location-model";
import type { PersonLocationDto } from "@/features/people/types";

const locations: PersonLocationDto[] = [
  {
    id: "current",
    label: "London, United Kingdom",
    latitude: 51.5074,
    longitude: -0.1278,
    precision: "city",
    isActive: true,
    effectiveFrom: "2026-08-18T12:00:00.000Z",
  },
  {
    id: "previous",
    label: "New York, NY",
    latitude: 40.7128,
    longitude: -74.006,
    precision: "city",
    isActive: false,
    effectiveFrom: "2026-08-10T12:00:00.000Z",
    effectiveTo: "2026-08-18T12:00:00.000Z",
  },
];

describe("people location model", () => {
  it("selects the active operational location", () => {
    expect(currentPersonLocation(locations)?.id).toBe("current");
  });

  it("resolves a location at the requested instant", () => {
    expect(personLocationAt(locations, "2026-08-17T09:00:00.000Z")?.id).toBe(
      "previous",
    );
    expect(personLocationAt(locations, "2026-08-18T12:00:00.000Z")?.id).toBe(
      "current",
    );
  });

  it("returns no location outside the maintained history", () => {
    expect(personLocationAt(locations, "2026-08-01T09:00:00.000Z")).toBe(
      undefined,
    );
    expect(personLocationAt(locations, "not-a-timestamp")).toBe(undefined);
  });
});
