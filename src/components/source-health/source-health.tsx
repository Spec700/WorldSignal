import type { SourceHealth as SourceHealthRecord } from "@/lib/events/types";
import { formatLocalTimestamp } from "@/lib/time/format";

const SOURCE_NAMES = {
  usgs: "USGS",
  gdacs: "GDACS",
  spc: "NOAA SPC",
} as const;

const HAZARD_SOURCES = ["usgs", "gdacs", "spc"] as const;

interface SourceHealthProps {
  health: SourceHealthRecord[];
  refreshing: boolean;
}

function sourceRecord(
  health: SourceHealthRecord[],
  source: (typeof HAZARD_SOURCES)[number],
) {
  return health.find((item) => item.source === source);
}

export function SourceHealth({ health, refreshing }: SourceHealthProps) {
  return (
    <div
      className="source-health-list"
      aria-label="Hazard source health"
      role="group"
    >
      {HAZARD_SOURCES.map((source) => {
        const record = sourceRecord(health, source);
        const state = refreshing
          ? "loading"
          : record?.state === "ok"
            ? "ok"
            : record?.state === "degraded"
              ? "degraded"
              : record?.state === "error"
                ? "error"
                : "idle";
        const detail = refreshing
          ? "Contacting source"
          : record?.state === "ok"
            ? `${record.eventCount} event${record.eventCount === 1 ? "" : "s"} · completed ${formatLocalTimestamp(record.completedAt)}`
            : record?.state === "degraded"
              ? `${record.eventCount} retained event${record.eventCount === 1 ? "" : "s"} · last good ${formatLocalTimestamp(record.lastSuccessfulAt!)}`
              : record?.state === "error"
                ? `${record.errorCode} · failed ${formatLocalTimestamp(record.completedAt)}`
                : "Not requested";

        return (
          <div className="source-health-row" key={source}>
            <span
              aria-hidden="true"
              className={`status-mark status-mark--${state}`}
            />
            <span className="source-health-copy">
              <span className="source-health-name">{SOURCE_NAMES[source]}</span>
              <span className="source-health-detail">{detail}</span>
              {record ? (
                <span className="source-health-timestamps">
                  Attempted {formatLocalTimestamp(record.attemptedAt)}
                  {record.upstreamUpdatedAt ? (
                    <>
                      {" "}
                      · source updated{" "}
                      {formatLocalTimestamp(record.upstreamUpdatedAt)}
                    </>
                  ) : null}
                </span>
              ) : null}
              {(record?.state === "error" || record?.state === "degraded") &&
              record.safeMessage ? (
                <span className="source-health-error">
                  {record.safeMessage}
                </span>
              ) : null}
            </span>
            <span className={`source-state-label source-state-label--${state}`}>
              {state === "ok"
                ? "Available"
                : state === "degraded"
                  ? "Degraded"
                  : state === "error"
                    ? "Unavailable"
                    : state === "loading"
                      ? "Contacting"
                      : "Idle"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function SourceHealthSummary({ health, refreshing }: SourceHealthProps) {
  if (refreshing) {
    return (
      <span className="health-summary health-summary--loading">
        <span className="status-mark status-mark--loading" aria-hidden="true" />
        Sources contacting
      </span>
    );
  }

  if (health.length === 0) {
    return (
      <span className="health-summary">
        <span className="status-mark status-mark--idle" aria-hidden="true" />
        Sources idle
      </span>
    );
  }

  const failedCount = health.filter(
    (source) => source.state === "error",
  ).length;
  const degradedCount = health.filter(
    (source) => source.state === "degraded",
  ).length;
  if (failedCount > 0) {
    return (
      <span className="health-summary health-summary--error">
        <span className="status-mark status-mark--error" aria-hidden="true" />
        {failedCount} source{failedCount === 1 ? "" : "s"} unavailable
        {degradedCount > 0 ? ` · ${degradedCount} degraded` : ""}
      </span>
    );
  }
  if (degradedCount > 0) {
    return (
      <span className="health-summary health-summary--degraded">
        <span
          className="status-mark status-mark--degraded"
          aria-hidden="true"
        />
        {degradedCount} source{degradedCount === 1 ? "" : "s"} degraded
      </span>
    );
  }
  return (
    <span className="health-summary health-summary--ok">
      <span className="status-mark status-mark--ok" aria-hidden="true" />
      {health.length} source{health.length === 1 ? "" : "s"} available
    </span>
  );
}
