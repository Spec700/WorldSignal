import type { GdacsGeometryCollection } from "@/lib/sources/gdacs/geometry";
import {
  classifyEventChanges,
  type EventChange,
  updateSuccessfulSourceBaseline,
} from "@/lib/events/change-detection";
import type {
  EventBatch,
  EventCategory,
  EventFilters,
  SourceHealth,
  WorldEvent,
} from "@/lib/events/types";

const HAZARD_CATEGORIES: EventCategory[] = [
  "earthquake",
  "tropical-cyclone",
  "flood",
  "drought",
  "volcano",
  "wildfire",
];

export interface WorldSignalState {
  batch?: EventBatch;
  batchFreshness: "none" | "current" | "previous";
  previousEventsById: Map<string, WorldEvent>;
  selectedEventId?: string;
  selectedGeometry?: GdacsGeometryCollection;
  geometryState: "idle" | "loading" | "ready" | "error";
  refreshState: "idle" | "loading" | "error";
  refreshError?: string;
  latestSourceHealth: SourceHealth[];
  filters: EventFilters;
  changesByEventId: Map<string, EventChange>;
  announcement: string;
  selectionNotice?: string;
}

export type WorldSignalAction =
  | { type: "refresh/started" }
  | { type: "refresh/succeeded"; batch: EventBatch }
  | {
      type: "refresh/failed";
      message: string;
      sources?: SourceHealth[];
    }
  | { type: "selection/set"; eventId: string }
  | { type: "selection/clear" }
  | { type: "filters/query-set"; query: string }
  | { type: "filters/window-set"; window: EventFilters["window"] };

export function createInitialWorldSignalState(): WorldSignalState {
  return {
    batchFreshness: "none",
    previousEventsById: new Map(),
    geometryState: "idle",
    refreshState: "idle",
    latestSourceHealth: [],
    filters: {
      module: "natural-hazards",
      categories: HAZARD_CATEGORIES,
      priorities: ["low", "medium", "high", "critical"],
      sources: ["usgs", "gdacs"],
      lifecycle: ["ongoing", "occurred", "ended", "unknown"],
      query: "",
      window: "7d",
      timeCursor: "",
    },
    changesByEventId: new Map(),
    announcement: "No event data loaded.",
  };
}

export function worldSignalReducer(
  state: WorldSignalState,
  action: WorldSignalAction,
): WorldSignalState {
  switch (action.type) {
    case "refresh/started":
      if (state.refreshState === "loading") {
        return state;
      }
      return {
        ...state,
        batchFreshness: state.batch ? "previous" : "none",
        refreshState: "loading",
        refreshError: undefined,
        announcement: "Refreshing USGS and GDACS hazard sources.",
      };

    case "refresh/succeeded": {
      const successfulSources = new Set(
        action.batch.sources
          .filter((source) => source.state === "ok")
          .map((source) => source.source),
      );
      const changesByEventId = classifyEventChanges(
        state.previousEventsById,
        action.batch.events,
      );
      const previousEventsById = updateSuccessfulSourceBaseline(
        state.previousEventsById,
        action.batch.events,
        successfulSources,
      );
      const selectionStillExists = state.selectedEventId
        ? action.batch.events.some(
            (event) => event.id === state.selectedEventId,
          )
        : false;
      const unavailableCount = action.batch.sources.filter(
        (source) => source.state === "error",
      ).length;
      const selectionNotice =
        state.selectedEventId && !selectionStillExists
          ? "The selected event is not present in the latest retrieval."
          : undefined;

      return {
        ...state,
        batch: action.batch,
        batchFreshness: "current",
        previousEventsById,
        selectedEventId: selectionStillExists
          ? state.selectedEventId
          : undefined,
        selectedGeometry: undefined,
        geometryState: "idle",
        refreshState: "idle",
        refreshError: undefined,
        latestSourceHealth: action.batch.sources,
        filters: {
          ...state.filters,
          timeCursor: action.batch.requestedRange.to,
        },
        changesByEventId,
        announcement: `${action.batch.events.length} events loaded. ${unavailableCount} source${unavailableCount === 1 ? "" : "s"} unavailable.`,
        selectionNotice,
      };
    }

    case "refresh/failed":
      return {
        ...state,
        batchFreshness: state.batch ? "previous" : "none",
        refreshState: "error",
        refreshError: action.message,
        latestSourceHealth:
          action.sources && action.sources.length > 0
            ? action.sources
            : state.latestSourceHealth,
        announcement: action.message,
      };

    case "selection/set":
      return {
        ...state,
        selectedEventId: action.eventId,
        selectedGeometry: undefined,
        geometryState: "idle",
        selectionNotice: undefined,
      };

    case "selection/clear":
      return {
        ...state,
        selectedEventId: undefined,
        selectedGeometry: undefined,
        geometryState: "idle",
        selectionNotice: undefined,
      };

    case "filters/query-set":
      return {
        ...state,
        filters: { ...state.filters, query: action.query },
      };

    case "filters/window-set":
      return {
        ...state,
        filters: { ...state.filters, window: action.window },
      };
  }
}
