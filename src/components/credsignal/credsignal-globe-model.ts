import type {
  CredSignalPriority,
  CredSignalProtecteeDto,
} from "@/features/credsignal/types";

const priorityColor: Record<CredSignalPriority, string> = {
  critical: "#ff726b",
  high: "#f2b35e",
  medium: "#69d2df",
  low: "#94acb6",
};

const priorityRadius: Record<CredSignalPriority, number> = {
  critical: 0.34,
  high: 0.29,
  medium: 0.24,
  low: 0.2,
};

export interface CredSignalGlobePoint {
  id: string;
  latitude: number;
  longitude: number;
  color: string;
  radius: number;
  altitude: number;
  displayName: string;
  organization?: string;
  locationLabel: string;
  priority: CredSignalPriority;
  openCaseCount: number;
  openTaskCount: number;
}

export function toCredSignalGlobePoints(
  protectees: CredSignalProtecteeDto[],
): CredSignalGlobePoint[] {
  return protectees.flatMap((protectee) => {
    if (!protectee.location || protectee.status !== "active") {
      return [];
    }
    const priority = protectee.activePriority ?? "low";

    return [
      {
        id: protectee.id,
        latitude: protectee.location.latitude,
        longitude: protectee.location.longitude,
        color: priorityColor[priority],
        radius: priorityRadius[priority],
        altitude: 0.014,
        displayName: protectee.displayName,
        organization: protectee.organization,
        locationLabel: protectee.location.label,
        priority,
        openCaseCount: protectee.openCaseCount,
        openTaskCount: protectee.openTaskCount,
      },
    ];
  });
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

export function credSignalPointTooltip(point: CredSignalGlobePoint): string {
  const priority = escapeHtml(point.priority);
  const name = escapeHtml(point.displayName);
  const location = escapeHtml(point.locationLabel);
  const organization = point.organization
    ? ` · ${escapeHtml(point.organization)}`
    : "";

  return `<div class="globe-tooltip"><span>Protectee · ${priority} priority</span><strong>${name}</strong><small>${location}${organization} · ${point.openCaseCount} open cases</small></div>`;
}
