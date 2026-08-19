import { worldEventSchema } from "@/lib/events/schema";
import type { EventFact, WorldEvent } from "@/lib/events/types";
import type { EventSourceAdapter } from "@/lib/sources/adapter";
import { SourceFetchError } from "@/lib/sources/errors";
import { fetchText, type FetchImplementation } from "@/lib/sources/fetch-json";
import { createRevisionFingerprint } from "@/lib/sources/fingerprint";

import { parseSpcTornadoCsv } from "./csv";
import { spcTornadoReportSchema, type SpcTornadoReport } from "./schema";
import {
  getSpcDailyReportUrl,
  getSpcReportDates,
  getSpcReportKey,
  getSpcTornadoCsvUrl,
} from "./urls";

const SPC_TIMEOUT_MS = 10_000;
const SPC_MAX_DAILY_BYTES = 512 * 1_024;
const SPC_FETCH_CONCURRENCY = 6;

interface DatedSpcTornadoReport {
  reportDate: Date;
  report: SpcTornadoReport;
}

function normalizeSpcOccurrence(reportDate: Date, time: string): string {
  const hour = Number(time.slice(0, 2));
  const minute = Number(time.slice(2));
  const dayOffset = hour < 12 ? 1 : 0;

  return new Date(
    Date.UTC(
      reportDate.getUTCFullYear(),
      reportDate.getUTCMonth(),
      reportDate.getUTCDate() + dayOffset,
      hour,
      minute,
    ),
  ).toISOString();
}

function reportIdentity(reportDate: Date, report: SpcTornadoReport): object {
  return {
    reportDay: getSpcReportKey(reportDate),
    time: report.time,
    location: report.location,
    county: report.county,
    state: report.state,
    latitude: report.latitude,
    longitude: report.longitude,
  };
}

function reportFacts(report: SpcTornadoReport): EventFact[] {
  const facts: EventFact[] = [
    { key: "preliminary", label: "Preliminary report", value: true },
    { key: "state", label: "State", value: report.state },
    { key: "county", label: "County", value: report.county },
    {
      key: "source-rating",
      label: "Source F/EF rating",
      value: report.fScale,
    },
  ];

  if (report.comments) {
    facts.push({
      key: "comments",
      label: "SPC comments",
      value: report.comments,
    });
  }

  return facts;
}

export function normalizeSpcTornadoReport(
  reportDate: Date,
  report: SpcTornadoReport,
  retrievedAt: string,
): WorldEvent {
  const occurredAt = normalizeSpcOccurrence(reportDate, report.time);
  const identity = reportIdentity(reportDate, report);
  const sourceEventId = createRevisionFingerprint(identity).slice(0, 24);
  const locationLabel = `${report.location}, ${report.county} County, ${report.state}`;
  const ratingKnown = report.fScale.toUpperCase() !== "UNK";

  return worldEventSchema.parse({
    schemaVersion: 1,
    id: `spc:tornado:${sourceEventId}`,
    module: "natural-hazards",
    category: "tornado",
    subtype: "preliminary-tornado-report",
    title: `Preliminary tornado report — ${locationLabel}`,
    ...(report.comments ? { summary: report.comments } : {}),
    locationLabel,
    countryCodes: ["US"],
    lifecycle: "occurred",
    occurredAt,
    updatedAt: occurredAt,
    centroid: {
      latitude: report.latitude,
      longitude: report.longitude,
    },
    geometry: {
      type: "Point",
      coordinates: [report.longitude, report.latitude],
    },
    geometryDetailAvailable: false,
    displayPriority: "high",
    priorityBasis: "NOAA SPC preliminary tornado report",
    nativeSeverity: {
      label: ratingKnown
        ? `Preliminary ${report.fScale} tornado report`
        : "Preliminary tornado report",
      description:
        "Preliminary observed report; details may change during NOAA review.",
    },
    verification: "authoritative-source",
    facts: reportFacts(report),
    sources: [
      {
        source: "spc",
        sourceEventId,
        label: "NOAA Storm Prediction Center",
        url: getSpcDailyReportUrl(reportDate),
        retrievedAt,
      },
    ],
    revisionFingerprint: createRevisionFingerprint({
      ...identity,
      fScale: report.fScale,
      comments: report.comments,
    }),
  });
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await operation(values[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () =>
      worker(),
    ),
  );
  return results;
}

interface SpcAdapterOptions {
  fetchImplementation?: FetchImplementation;
  now?: () => Date;
}

export class SpcTornadoAdapter implements EventSourceAdapter {
  readonly source = "spc" as const;
  private readonly fetchImplementation?: FetchImplementation;
  private readonly now: () => Date;

  constructor(options: SpcAdapterOptions = {}) {
    this.fetchImplementation = options.fetchImplementation;
    this.now = options.now ?? (() => new Date());
  }

  async fetchAndNormalize({
    from,
    to,
    signal,
  }: Parameters<EventSourceAdapter["fetchAndNormalize"]>[0]) {
    const reportDates = getSpcReportDates(from, to);
    const dailyReports = await mapWithConcurrency(
      reportDates,
      SPC_FETCH_CONCURRENCY,
      async (reportDate): Promise<DatedSpcTornadoReport[]> => {
        const csv = await fetchText(getSpcTornadoCsvUrl(reportDate), {
          signal,
          timeoutMs: SPC_TIMEOUT_MS,
          maxBytes: SPC_MAX_DAILY_BYTES,
          sourceLabel: "NOAA SPC",
          fetchImplementation: this.fetchImplementation,
        });

        return parseSpcTornadoCsv(csv).map((row) => {
          const parsed = spcTornadoReportSchema.safeParse({
            time: row[0],
            fScale: row[1],
            location: row[2],
            county: row[3],
            state: row[4],
            latitude: row[5],
            longitude: row[6],
            comments: row[7],
          });

          if (!parsed.success) {
            throw new SourceFetchError(
              "schema",
              "NOAA SPC returned tornado data that does not match the expected schema.",
              { cause: parsed.error },
            );
          }

          return { reportDate, report: parsed.data };
        });
      },
    );
    const retrievedAt = this.now().toISOString();
    const fromTime = from.getTime();
    const toTime = to.getTime();

    return {
      events: dailyReports
        .flat()
        .map(({ reportDate, report }) =>
          normalizeSpcTornadoReport(reportDate, report, retrievedAt),
        )
        .filter((event) => {
          const occurredAt = Date.parse(event.occurredAt!);
          return occurredAt >= fromTime && occurredAt <= toTime;
        }),
    };
  }
}
