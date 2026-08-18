import type { EventCategory } from "@/lib/events/types";

const CATEGORY_CODE: Record<EventCategory, string> = {
  earthquake: "EQ",
  "tropical-cyclone": "TC",
  flood: "FL",
  drought: "DR",
  volcano: "VO",
  wildfire: "WF",
  "mass-attack": "MA",
  bombing: "BO",
  "hostage-event": "HE",
  terrorism: "TE",
  "major-violent-incident": "MI",
  unknown: "?",
};

const CATEGORY_LABEL: Record<EventCategory, string> = {
  earthquake: "Earthquake",
  "tropical-cyclone": "Tropical cyclone",
  flood: "Flood",
  drought: "Drought",
  volcano: "Volcano",
  wildfire: "Wildfire",
  "mass-attack": "Mass attack",
  bombing: "Bombing",
  "hostage-event": "Hostage event",
  terrorism: "Terrorism",
  "major-violent-incident": "Major violent incident",
  unknown: "Unknown",
};

export function eventCategoryLabel(category: EventCategory): string {
  return CATEGORY_LABEL[category];
}

export function EventIcon({ category }: { category: EventCategory }) {
  return (
    <span aria-hidden="true" className={`event-icon event-icon--${category}`}>
      {CATEGORY_CODE[category]}
    </span>
  );
}
