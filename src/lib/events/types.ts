export type {
  DisplayPriority,
  EventBatch,
  EventCategory,
  EventFact,
  EventLifecycle,
  HazardWindow,
  ModuleId,
  NativeSeverity,
  SourceHealth,
  SourceId,
  SourceReference,
  VerificationStatus,
  WorldEvent,
} from "./schema";

export interface EventFilters {
  module: "natural-hazards";
  categories: EventCategory[];
  priorities: DisplayPriority[];
  sources: Array<"usgs" | "gdacs" | "spc">;
  lifecycle: EventLifecycle[];
  query: string;
  window: HazardWindow;
  timeCursor: string;
}

import type {
  DisplayPriority,
  EventCategory,
  EventLifecycle,
  HazardWindow,
} from "./schema";
