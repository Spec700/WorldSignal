import { worldEventSchema } from "@/lib/events/schema";
import type { EventFact, WorldEvent } from "@/lib/events/types";
import type { EventSourceAdapter } from "@/lib/sources/adapter";
import { asSourceFetchError, SourceFetchError } from "@/lib/sources/errors";
import { fetchText, type FetchImplementation } from "@/lib/sources/fetch-json";
import { createRevisionFingerprint } from "@/lib/sources/fingerprint";
import {
  retryTransientSourceRequest,
  type RetrySleep,
} from "@/lib/sources/retry";

import { parseSpcTornadoCsv } from "./csv";
import { spcTornadoReportSchema, type SpcTornadoReport } from "./schema";
import {
  getSpcDailyReportUrl,
  getSpcReportDates,
  getSpcReportDate,
  getSpcReportKey,
  getSpcTornadoCsvUrl,
} from "./urls";

const SPC_TIMEOUT_MS = 10_000;
const SPC_MAX_DAILY_BYTES = 512 * 1_024;
const SPC_FETCH_CONCURRENCY = 3;
const SPC_MAX_ATTEMPTS_PER_REPORT = 2;
const SPC_ACTIVE_REPORT_CACHE_MS = 5 * 60 * 1_000;
const SPC_HISTORICAL_REPORT_CACHE_MS = 24 * 60 * 60 * 1_000;
const SPC_CACHE_MAX_ENTRIES = 64;

interface DatedSpcTornadoReport {
  reportDate: Date;
  report: SpcTornadoReport;
}

interface CachedSpcDailyReport {
  reports: SpcTornadoReport[];
  expiresAt: number;
}

const sharedDailyReportCache = new Map<string, CachedSpcDailyReport>();

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
  retrySleep?: RetrySleep;
  clock?: () => number;
  cache?: Map<string, CachedSpcDailyReport>;
}

export class SpcTornadoAdapter implements EventSourceAdapter {
  readonly source = "spc" as const;
  private readonly fetchImplementation?: FetchImplementation;
  private readonly now: () => Date;
  private readonly retrySleep?: RetrySleep;
  private readonly clock: () => number;
  private readonly cache: Map<string, CachedSpcDailyReport>;

  constructor(options: SpcAdapterOptions = {}) {
    this.fetchImplementation = options.fetchImplementation;
    this.now = options.now ?? (() => new Date());
    this.retrySleep = options.retrySleep;
    this.clock = options.clock ?? Date.now;
    this.cache =
      options.cache ??
      (options.fetchImplementation ? new Map() : sharedDailyReportCache);
  }

  private readCachedReport(reportKey: string): SpcTornadoReport[] | undefined {
    const cached = this.cache.get(reportKey);
    if (!cached) {
      return undefined;
    }
    if (cached.expiresAt <= this.clock()) {
      this.cache.delete(reportKey);
      return undefined;
    }

    return cached.reports;
  }

  private cacheReport(reportDate: Date, reports: SpcTornadoReport[]): void {
    const reportKey = getSpcReportKey(reportDate);
    const activeReportKey = getSpcReportKey(getSpcReportDate(this.now()));
    const ttl =
      reportKey === activeReportKey
        ? SPC_ACTIVE_REPORT_CACHE_MS
        : SPC_HISTORICAL_REPORT_CACHE_MS;

    if (
      !this.cache.has(reportKey) &&
      this.cache.size >= SPC_CACHE_MAX_ENTRIES
    ) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(reportKey, {
      reports,
      expiresAt: this.clock() + ttl,
    });
  }

  private async fetchDailyReport(
    reportDate: Date,
    signal: AbortSignal,
  ): Promise<DatedSpcTornadoReport[]> {
    const reportKey = getSpcReportKey(reportDate);
    const cached = this.readCachedReport(reportKey);
    if (cached) {
      return cached.map((report) => ({ reportDate, report }));
    }

    let csv: string;
    try {
      csv = await retryTransientSourceRequest(
        () =>
          fetchText(getSpcTornadoCsvUrl(reportDate), {
            signal,
            timeoutMs: SPC_TIMEOUT_MS,
            maxBytes: SPC_MAX_DAILY_BYTES,
            sourceLabel: "NOAA SPC",
            fetchImplementation: this.fetchImplementation,
          }),
        {
          signal,
          maxAttempts: SPC_MAX_ATTEMPTS_PER_REPORT,
          ...(this.retrySleep ? { sleep: this.retrySleep } : {}),
        },
      );
    } catch (error) {
      const sourceError = asSourceFetchError(error);
      throw new SourceFetchError(
        sourceError.code,
        `NOAA SPC report ${reportKey} could not be retrieved. ${sourceError.safeMessage}`,
        { cause: sourceError },
      );
    }

    const reports = parseSpcTornadoCsv(csv).map((row) => {
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

      return parsed.data;
    });

    this.cacheReport(reportDate, reports);
    return reports.map((report) => ({ reportDate, report }));
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
      (reportDate) => this.fetchDailyReport(reportDate, signal),
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
