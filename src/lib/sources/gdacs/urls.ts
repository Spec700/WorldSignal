import type { GdacsEventType } from "./schema";

const GDACS_API_ROOT = "https://www.gdacs.org/gdacsapi/api";

export const GDACS_EVENT_TYPES: readonly GdacsEventType[] = [
  "TC",
  "FL",
  "DR",
  "VO",
  "WF",
];

export function getGdacsSearchUrl(input: {
  from: Date;
  to: Date;
  pageNumber: number;
  pageSize: number;
}): URL {
  const url = new URL(`${GDACS_API_ROOT}/Events/geteventlist/search`);
  url.searchParams.set("eventlist", GDACS_EVENT_TYPES.join(";"));
  url.searchParams.set("alertlevel", "green;orange;red");
  url.searchParams.set("fromDate", input.from.toISOString());
  url.searchParams.set("toDate", input.to.toISOString());
  url.searchParams.set("pageSize", String(input.pageSize));
  url.searchParams.set("pageNumber", String(input.pageNumber));
  url.searchParams.set("caller", "WorldSignal");
  return url;
}

export function getGdacsGeometryUrl(input: {
  eventType: GdacsEventType;
  eventId: number;
  episodeId: number;
}): URL {
  const url = new URL(`${GDACS_API_ROOT}/polygons/getgeometry`);
  url.searchParams.set("eventtype", input.eventType);
  url.searchParams.set("eventid", String(input.eventId));
  url.searchParams.set("episodeid", String(input.episodeId));
  return url;
}
