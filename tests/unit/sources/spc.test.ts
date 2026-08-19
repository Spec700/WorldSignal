import { describe, expect, it, vi } from "vitest";

import { SourceFetchError } from "@/lib/sources/errors";
import {
  SpcTornadoAdapter,
  normalizeSpcTornadoReport,
} from "@/lib/sources/spc/adapter";
import { parseSpcTornadoCsv } from "@/lib/sources/spc/csv";
import { spcTornadoReportSchema } from "@/lib/sources/spc/schema";
import {
  getSpcReportDates,
  getSpcReportKey,
  getSpcTornadoCsvUrl,
} from "@/lib/sources/spc/urls";
import { spcTornadoCsvFixture } from "../../fixtures/spc";

describe("NOAA SPC report dates", () => {
  it("uses the SPC 12Z convective-day boundary", () => {
    expect(getSpcReportKey(new Date("2026-08-18T11:59:00.000Z"))).toBe(
      "260818",
    );
    expect(
      getSpcReportDates(
        new Date("2026-08-18T11:59:00.000Z"),
        new Date("2026-08-18T12:01:00.000Z"),
      ).map(getSpcReportKey),
    ).toEqual(["260817", "260818"]);
    expect(getSpcTornadoCsvUrl(new Date("2026-08-18T00:00:00.000Z")).href).toBe(
      "https://www.spc.noaa.gov/climo/reports/260818_rpts_filtered_torn.csv",
    );
  });
});

describe("NOAA SPC tornado CSV", () => {
  it("parses quoted commas and validates report fields", () => {
    const rows = parseSpcTornadoCsv(spcTornadoCsvFixture);
    expect(rows).toHaveLength(2);
    expect(rows[0][7]).toContain("tornado, damage");
    expect(
      spcTornadoReportSchema.parse({
        time: rows[0][0],
        fScale: rows[0][1],
        location: rows[0][2],
        county: rows[0][3],
        state: rows[0][4],
        latitude: rows[0][5],
        longitude: rows[0][6],
        comments: rows[0][7],
      }),
    ).toMatchObject({ latitude: 35.22, longitude: -97.51, state: "OK" });
  });

  it("rejects a changed header rather than silently shifting columns", () => {
    expect(() =>
      parseSpcTornadoCsv(spcTornadoCsvFixture.replace("F_Scale", "Rating")),
    ).toThrow(SourceFetchError);
  });
});

describe("NOAA SPC tornado normalization", () => {
  it("keeps preliminary provenance and rolls post-midnight reports forward", () => {
    const row = parseSpcTornadoCsv(spcTornadoCsvFixture)[1];
    const report = spcTornadoReportSchema.parse({
      time: row[0],
      fScale: row[1],
      location: row[2],
      county: row[3],
      state: row[4],
      latitude: row[5],
      longitude: row[6],
      comments: row[7],
    });
    const event = normalizeSpcTornadoReport(
      new Date("2026-08-18T00:00:00.000Z"),
      report,
      "2026-08-19T10:00:00.000Z",
    );

    expect(event).toMatchObject({
      category: "tornado",
      lifecycle: "occurred",
      occurredAt: "2026-08-19T00:30:00.000Z",
      displayPriority: "high",
      geometryDetailAvailable: false,
      countryCodes: ["US"],
    });
    expect(event.sources[0]).toMatchObject({
      source: "spc",
      label: "NOAA Storm Prediction Center",
    });
    expect(event.title).toMatch(/Preliminary tornado report/);
    expect(event.facts).toContainEqual({
      key: "preliminary",
      label: "Preliminary report",
      value: true,
    });
  });

  it("aggregates daily filtered files and clips reports to the requested range", async () => {
    const fetchImplementation = vi.fn(async () =>
      Promise.resolve(
        new Response(spcTornadoCsvFixture, {
          headers: { "content-type": "text/csv" },
        }),
      ),
    );
    const adapter = new SpcTornadoAdapter({
      fetchImplementation,
      now: () => new Date("2026-08-19T10:00:00.000Z"),
    });
    const result = await adapter.fetchAndNormalize({
      from: new Date("2026-08-18T23:30:00.000Z"),
      to: new Date("2026-08-19T01:00:00.000Z"),
      signal: new AbortController().signal,
    });

    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(result.events).toHaveLength(1);
    expect(result.events[0].occurredAt).toBe("2026-08-19T00:30:00.000Z");
  });
});
