import { eventCategoryLabel } from "@/components/event-icon";
import type {
  DisplayPriority,
  EventCategory,
  WorldEvent,
} from "@/lib/events/types";
import { formatEventAge } from "@/lib/time/format";

const PRIORITY_COLOR: Record<DisplayPriority, string> = {
  critical: "#ff6b64",
  high: "#f2ad53",
  medium: "#58cddd",
  low: "#91aab4",
};

const PRIORITY_RADIUS: Record<DisplayPriority, number> = {
  critical: 0.32,
  high: 0.27,
  medium: 0.22,
  low: 0.18,
};

export interface GlobeEventPoint {
  kind: "event";
  id: string;
  latitude: number;
  longitude: number;
  color: string;
  radius: number;
  altitude: number;
  title: string;
  locationLabel: string;
  category: EventCategory;
  priority: DisplayPriority;
  updatedAt: string;
}

export function toGlobeEventPoints(events: WorldEvent[]): GlobeEventPoint[] {
  return events.map((event) => ({
    kind: "event",
    id: event.id,
    latitude: event.centroid.latitude,
    longitude: event.centroid.longitude,
    color: PRIORITY_COLOR[event.displayPriority],
    radius: PRIORITY_RADIUS[event.displayPriority],
    altitude: 0.012,
    title: event.title,
    locationLabel: event.locationLabel,
    category: event.category,
    priority: event.displayPriority,
    updatedAt: event.updatedAt,
  }));
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character] ?? character,
  );
}

export function globePointTooltip(point: GlobeEventPoint): string {
  const category = escapeHtml(eventCategoryLabel(point.category));
  const priority = escapeHtml(point.priority);
  const title = escapeHtml(point.title);
  const location = escapeHtml(point.locationLabel);
  const age = escapeHtml(formatEventAge(point.updatedAt));

  return `<div class="globe-tooltip"><span>${category} · ${priority} priority</span><strong>${title}</strong><small>${location} · ${age}</small></div>`;
}
