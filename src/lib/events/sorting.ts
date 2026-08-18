import type { DisplayPriority, WorldEvent } from "./types";

const PRIORITY_RANK: Record<DisplayPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function sortEventsByPriority(events: WorldEvent[]): WorldEvent[] {
  return [...events].sort((left, right) => {
    const priorityDifference =
      PRIORITY_RANK[left.displayPriority] -
      PRIORITY_RANK[right.displayPriority];
    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    const updatedDifference =
      Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    if (updatedDifference !== 0) {
      return updatedDifference;
    }

    const titleDifference = left.title.localeCompare(right.title);
    return titleDifference !== 0
      ? titleDifference
      : left.id.localeCompare(right.id);
  });
}
