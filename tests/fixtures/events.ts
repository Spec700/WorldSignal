import type { EventBatch, WorldEvent } from "@/lib/events/types";

export const earthquakeFixture: WorldEvent = {
  schemaVersion: 1,
  id: "usgs:us7000abcd",
  module: "natural-hazards",
  category: "earthquake",
  title: "M6.4 earthquake — 120 km east of Sendai, Japan",
  locationLabel: "120 km east of Sendai, Japan",
  countryCodes: ["JP"],
  lifecycle: "occurred",
  occurredAt: "2026-08-18T08:15:30.000Z",
  updatedAt: "2026-08-18T09:04:12.000Z",
  centroid: {
    latitude: 38.322,
    longitude: 143.248,
  },
  geometry: {
    type: "Point",
    coordinates: [143.248, 38.322],
  },
  geometryDetailAvailable: false,
  displayPriority: "high",
  priorityBasis: "Derived from earthquake magnitude (M6.0–6.9)",
  nativeSeverity: {
    label: "Magnitude 6.4",
    value: 6.4,
    unit: "Mw",
  },
  verification: "authoritative-source",
  facts: [
    { key: "depth", label: "Depth", value: 35, unit: "km" },
    { key: "review-status", label: "Review status", value: "reviewed" },
  ],
  sources: [
    {
      source: "usgs",
      sourceEventId: "us7000abcd",
      label: "U.S. Geological Survey",
      url: "https://earthquake.usgs.gov/earthquakes/eventpage/us7000abcd",
      retrievedAt: "2026-08-18T10:00:00.000Z",
      sourceUpdatedAt: "2026-08-18T09:04:12.000Z",
    },
  ],
  revisionFingerprint: "fixture-usgs-revision-1",
};

export const cycloneFixture: WorldEvent = {
  schemaVersion: 1,
  id: "gdacs:TC:1001234",
  module: "natural-hazards",
  category: "tropical-cyclone",
  title: "Tropical Cyclone Example",
  locationLabel: "Northwest Pacific",
  countryCodes: ["JP", "PH"],
  lifecycle: "ongoing",
  startAt: "2026-08-16T00:00:00.000Z",
  updatedAt: "2026-08-18T09:30:00.000Z",
  centroid: {
    latitude: 19.4,
    longitude: 132.7,
  },
  geometry: {
    type: "Point",
    coordinates: [132.7, 19.4],
  },
  geometryDetailAvailable: true,
  displayPriority: "critical",
  priorityBasis: "GDACS humanitarian-impact alert",
  nativeSeverity: {
    label: "Red alert",
    description: "GDACS humanitarian-impact alert level",
  },
  verification: "authoritative-source",
  facts: [
    { key: "episode", label: "Episode", value: 7 },
    { key: "current", label: "Current", value: true },
  ],
  sources: [
    {
      source: "gdacs",
      sourceEventId: "TC:1001234",
      label: "Global Disaster Alert and Coordination System",
      url: "https://www.gdacs.org/report.aspx?eventid=1001234&episodeid=7&eventtype=TC",
      retrievedAt: "2026-08-18T10:00:00.000Z",
      sourceUpdatedAt: "2026-08-18T09:30:00.000Z",
    },
  ],
  revisionFingerprint: "fixture-gdacs-revision-1",
};

export const eventBatchFixture: EventBatch = {
  schemaVersion: 1,
  generatedAt: "2026-08-18T10:00:00.000Z",
  requestedRange: {
    from: "2026-08-11T10:00:00.000Z",
    to: "2026-08-18T10:00:00.000Z",
  },
  events: [earthquakeFixture, cycloneFixture],
  sources: [
    {
      source: "usgs",
      state: "ok",
      attemptedAt: "2026-08-18T09:59:58.000Z",
      completedAt: "2026-08-18T09:59:59.000Z",
      upstreamUpdatedAt: "2026-08-18T09:04:12.000Z",
      eventCount: 1,
    },
    {
      source: "gdacs",
      state: "ok",
      attemptedAt: "2026-08-18T09:59:58.000Z",
      completedAt: "2026-08-18T10:00:00.000Z",
      upstreamUpdatedAt: "2026-08-18T09:30:00.000Z",
      eventCount: 1,
    },
    {
      source: "spc",
      state: "ok",
      attemptedAt: "2026-08-18T09:59:58.000Z",
      completedAt: "2026-08-18T10:00:00.000Z",
      eventCount: 0,
    },
  ],
};
