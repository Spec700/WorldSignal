const compactTimestampFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});

const fullTimestampFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZoneName: "short",
});

export function formatLocalTimestamp(
  timestamp: string,
  style: "compact" | "full" = "compact",
): string {
  const parsed = new Date(timestamp);
  if (!Number.isFinite(parsed.getTime())) {
    return "Unknown time";
  }

  return (
    style === "full" ? fullTimestampFormatter : compactTimestampFormatter
  ).format(parsed);
}

export function formatEventAge(
  timestamp: string,
  relativeTo = Date.now(),
): string {
  const eventTime = Date.parse(timestamp);
  if (!Number.isFinite(eventTime)) {
    return "age unknown";
  }

  const elapsedMinutes = Math.max(
    0,
    Math.floor((relativeTo - eventTime) / 60_000),
  );
  if (elapsedMinutes < 1) {
    return "just updated";
  }
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 48) {
    return `${elapsedHours}h ago`;
  }

  return `${Math.floor(elapsedHours / 24)}d ago`;
}

export function formatCoordinate(value: number, axis: "lat" | "lon"): string {
  const direction =
    axis === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  return `${Math.abs(value).toFixed(2)}°${direction}`;
}
