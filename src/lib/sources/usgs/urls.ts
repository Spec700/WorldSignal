const USGS_FEED_ROOT =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary";

const FEED_BY_RANGE = {
  day: `${USGS_FEED_ROOT}/4.5_day.geojson`,
  week: `${USGS_FEED_ROOT}/4.5_week.geojson`,
  month: `${USGS_FEED_ROOT}/4.5_month.geojson`,
} as const;

const HOUR = 60 * 60 * 1_000;

export function getUsgsFeedUrl(from: Date, to: Date): URL {
  const rangeHours = (to.getTime() - from.getTime()) / HOUR;

  if (!Number.isFinite(rangeHours) || rangeHours <= 0) {
    throw new RangeError("USGS feed range must be positive");
  }

  if (rangeHours <= 25) {
    return new URL(FEED_BY_RANGE.day);
  }

  if (rangeHours <= 8 * 24) {
    return new URL(FEED_BY_RANGE.week);
  }

  if (rangeHours <= 31 * 24) {
    return new URL(FEED_BY_RANGE.month);
  }

  throw new RangeError("USGS rolling feeds support at most 30 days");
}
