import type { GdacsGeometryCollection } from "@/lib/sources/gdacs/geometry";
import type { HazardSnapshot } from "@/features/hazards/client/hazard-snapshot-store";
import {
  classifyEventChanges,
  type EventChange,
  updateSuccessfulSourceBaseline,
} from "@/lib/events/change-detection";
import type {
  EventBatch,
  EventCategory,
  EventFilters,
  HazardWindow,
  SourceId,
  SourceHealth,
  WorldEvent,
} from "@/lib/events/types";

const HAZARD_CATEGORIES: EventCategory[] = [
  "earthquake",
  "tropical-cyclone",
  "flood",
  "drought",
  "tornado",
  "volcano",
  "wildfire",
];

const WINDOW_MILLISECONDS: Record<HazardWindow, number> = {
  "24h": 24 * 60 * 60 * 1_000,
  "7d": 7 * 24 * 60 * 60 * 1_000,
  "30d": 30 * 24 * 60 * 60 * 1_000,
};

function eventSource(event: WorldEvent): SourceId {
  return event.sources[0].source;
}

function batchDuration(batch: EventBatch): number {
  return (
    Date.parse(batch.requestedRange.to) - Date.parse(batch.requestedRange.from)
  );
}

function batchesUseSameWindow(
  previous: EventBatch | undefined,
  next: EventBatch,
): previous is EventBatch {
  return Boolean(previous && batchDuration(previous) === batchDuration(next));
}

function batchMatchesWindow(
  batch: EventBatch | undefined,
  window: HazardWindow,
): batch is EventBatch {
  return Boolean(batch && batchDuration(batch) === WINDOW_MILLISECONDS[window]);
}

function retainedEventCounts(events: WorldEvent[]): Map<SourceId, number> {
  const counts = new Map<SourceId, number>();
  for (const event of events) {
    const source = eventSource(event);
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }
  return counts;
}

function degradeFailedSources(
  currentHealth: SourceHealth[],
  previousHealth: SourceHealth[],
  eventCounts: ReadonlyMap<SourceId, number>,
  allowRetention: boolean,
): SourceHealth[] {
  if (!allowRetention) {
    return currentHealth;
  }

  const previousBySource = new Map(
    previousHealth.map((health) => [health.source, health]),
  );

  return currentHealth.map((health): SourceHealth => {
    if (health.state !== "error") {
      return health;
    }

    const previous = previousBySource.get(health.source);
    if (!previous || previous.state === "error") {
      return health;
    }

    const lastSuccessfulAt =
      previous.state === "ok"
        ? previous.completedAt
        : previous.lastSuccessfulAt;
    if (!lastSuccessfulAt) {
      return health;
    }

    return {
      ...health,
      state: "degraded",
      eventCount: eventCounts.get(health.source) ?? 0,
      lastSuccessfulAt,
      ...(previous.upstreamUpdatedAt
        ? { upstreamUpdatedAt: previous.upstreamUpdatedAt }
        : {}),
    };
  });
}

function mergeRetainedSourceData(
  previousBatch: EventBatch | undefined,
  previousHealth: SourceHealth[],
  nextBatch: EventBatch,
): EventBatch {
  if (!batchesUseSameWindow(previousBatch, nextBatch)) {
    return nextBatch;
  }

  const failedSources = new Set(
    nextBatch.sources
      .filter((source) => source.state === "error")
      .map((source) => source.source),
  );
  if (failedSources.size === 0) {
    return nextBatch;
  }

  const nextIds = new Set(nextBatch.events.map((event) => event.id));
  const retainedEvents = previousBatch.events.filter(
    (event) => failedSources.has(eventSource(event)) && !nextIds.has(event.id),
  );
  const events = [...nextBatch.events, ...retainedEvents];

  return {
    ...nextBatch,
    events,
    sources: degradeFailedSources(
      nextBatch.sources,
      previousHealth,
      retainedEventCounts(retainedEvents),
      true,
    ),
  };
}

export interface WorldSignalState {
  batch?: EventBatch;
  batchFreshness: "none" | "current" | "previous";
  previousEventsById: Map<string, WorldEvent>;
  selectedEventId?: string;
  selectedPersonId?: string;
  selectedGeometry?: GdacsGeometryCollection;
  geometryState: "idle" | "loading" | "ready" | "error";
  geometryError?: string;
  geometryRequestVersion: number;
  refreshState: "idle" | "loading" | "error";
  refreshError?: string;
  latestSourceHealth: SourceHealth[];
  filters: EventFilters;
  changesByEventId: Map<string, EventChange>;
  announcement: string;
  selectionNotice?: string;
  cacheState: "checking" | "empty" | "saving" | "stored" | "error";
  batchOrigin: "none" | "retrieved" | "stored";
  cacheError?: string;
}

export type WorldSignalAction =
  | { type: "refresh/started" }
  | { type: "refresh/succeeded"; batch: EventBatch }
  | {
      type: "refresh/failed";
      message: string;
      sources?: SourceHealth[];
    }
  | { type: "cache/restore-started" }
  | { type: "cache/restored"; snapshot: HazardSnapshot }
  | { type: "cache/missed"; window: EventFilters["window"] }
  | {
      type: "cache/restore-failed";
      window: EventFilters["window"];
      message: string;
    }
  | {
      type: "cache/saved";
      generatedAt: string;
      window: EventFilters["window"];
    }
  | {
      type: "cache/save-failed";
      generatedAt: string;
      window: EventFilters["window"];
      message: string;
    }
  | { type: "selection/set"; eventId: string }
  | { type: "person-selection/set"; personId: string }
  | { type: "person-selection/hidden"; personId: string }
  | { type: "selection/clear" }
  | { type: "selection/hidden"; eventId: string }
  | { type: "geometry/requested"; eventId: string }
  | {
      type: "geometry/succeeded";
      eventId: string;
      geometry: GdacsGeometryCollection;
    }
  | { type: "geometry/failed"; eventId: string; message: string }
  | { type: "geometry/retry" }
  | { type: "filters/query-set"; query: string }
  | { type: "filters/window-set"; window: EventFilters["window"] }
  | { type: "filters/category-toggle"; category: EventCategory }
  | {
      type: "filters/priority-toggle";
      priority: EventFilters["priorities"][number];
    }
  | {
      type: "filters/source-toggle";
      source: EventFilters["sources"][number];
    }
  | {
      type: "filters/lifecycle-toggle";
      lifecycle: EventFilters["lifecycle"][number];
    }
  | { type: "filters/time-cursor-set"; timeCursor: string }
  | { type: "filters/reset-visibility"; timeCursor: string };

function toggleValue<T>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];
}

export function createInitialWorldSignalState(): WorldSignalState {
  return {
    batchFreshness: "none",
    previousEventsById: new Map(),
    geometryState: "idle",
    geometryRequestVersion: 0,
    refreshState: "idle",
    latestSourceHealth: [],
    filters: {
      module: "natural-hazards",
      categories: HAZARD_CATEGORIES,
      priorities: ["low", "medium", "high", "critical"],
      sources: ["usgs", "gdacs", "spc"],
      lifecycle: ["ongoing", "occurred", "ended", "unknown"],
      query: "",
      window: "7d",
      timeCursor: "",
    },
    changesByEventId: new Map(),
    announcement: "No event data loaded.",
    cacheState: "checking",
    batchOrigin: "none",
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
        announcement: "Refreshing hazard sources.",
      };

    case "refresh/succeeded": {
      const batch = mergeRetainedSourceData(
        state.batch,
        state.latestSourceHealth,
        action.batch,
      );
      const successfulSources = new Set(
        batch.sources
          .filter((source) => source.state === "ok")
          .map((source) => source.source),
      );
      const changesByEventId = classifyEventChanges(
        state.previousEventsById,
        batch.events,
      );
      const previousEventsById = updateSuccessfulSourceBaseline(
        state.previousEventsById,
        batch.events,
        successfulSources,
      );
      const selectionStillExists = state.selectedEventId
        ? batch.events.some((event) => event.id === state.selectedEventId)
        : false;
      const unavailableCount = batch.sources.filter(
        (source) => source.state === "error",
      ).length;
      const degradedCount = batch.sources.filter(
        (source) => source.state === "degraded",
      ).length;
      const selectionNotice =
        state.selectedEventId && !selectionStillExists
          ? "The selected event is not present in the latest retrieval."
          : undefined;

      return {
        ...state,
        batch,
        batchFreshness: "current",
        previousEventsById,
        selectedEventId: selectionStillExists
          ? state.selectedEventId
          : undefined,
        selectedPersonId: state.selectedPersonId,
        selectedGeometry: undefined,
        geometryState: "idle",
        geometryError: undefined,
        refreshState: "idle",
        refreshError: undefined,
        latestSourceHealth: batch.sources,
        cacheState: "saving",
        batchOrigin: "retrieved",
        cacheError: undefined,
        filters: {
          ...state.filters,
          timeCursor: batch.requestedRange.to,
        },
        changesByEventId,
        announcement: `${batch.events.length} events loaded. ${degradedCount} source${degradedCount === 1 ? "" : "s"} degraded; ${unavailableCount} source${unavailableCount === 1 ? "" : "s"} unavailable.`,
        selectionNotice,
      };
    }

    case "cache/restore-started":
      return {
        ...state,
        batchFreshness: state.batch ? "previous" : "none",
        cacheState: "checking",
        cacheError: undefined,
      };

    case "cache/restored":
      return {
        ...state,
        batch: action.snapshot.batch,
        batchFreshness: "current",
        previousEventsById: new Map(
          action.snapshot.baselineEvents.map((event) => [event.id, event]),
        ),
        selectedEventId: undefined,
        selectedPersonId: undefined,
        selectedGeometry: undefined,
        geometryState: "idle",
        geometryError: undefined,
        refreshState: "idle",
        refreshError: undefined,
        latestSourceHealth: action.snapshot.batch.sources,
        filters: {
          ...state.filters,
          window: action.snapshot.window,
          timeCursor: action.snapshot.batch.requestedRange.to,
        },
        changesByEventId: new Map(action.snapshot.changes),
        announcement: `${action.snapshot.batch.events.length} events restored from browser-local storage. No hazard source was contacted.`,
        selectionNotice: undefined,
        cacheState: "stored",
        batchOrigin: "stored",
        cacheError: undefined,
      };

    case "cache/missed":
      return {
        ...state,
        filters: { ...state.filters, window: action.window },
        cacheState: "empty",
        cacheError: undefined,
      };

    case "cache/restore-failed":
      return {
        ...state,
        filters: { ...state.filters, window: action.window },
        cacheState: "error",
        cacheError: action.message,
        announcement: action.message,
      };

    case "cache/saved":
      if (
        state.batch?.generatedAt !== action.generatedAt ||
        state.filters.window !== action.window
      ) {
        return state;
      }
      return {
        ...state,
        cacheState: "stored",
        cacheError: undefined,
        announcement: `${state.batch.events.length} events loaded and stored in this browser.`,
      };

    case "cache/save-failed":
      if (
        state.batch?.generatedAt !== action.generatedAt ||
        state.filters.window !== action.window
      ) {
        return state;
      }
      return {
        ...state,
        cacheState: "error",
        cacheError: action.message,
        announcement: action.message,
      };

    case "refresh/failed": {
      const eventCounts = retainedEventCounts(state.batch?.events ?? []);
      const latestSourceHealth =
        action.sources && action.sources.length > 0
          ? degradeFailedSources(
              action.sources,
              state.latestSourceHealth,
              eventCounts,
              batchMatchesWindow(state.batch, state.filters.window),
            )
          : state.latestSourceHealth;

      return {
        ...state,
        batchFreshness: state.batch ? "previous" : "none",
        refreshState: "error",
        refreshError: action.message,
        latestSourceHealth,
        announcement: action.message,
      };
    }

    case "selection/set":
      if (state.selectedEventId === action.eventId) {
        return state;
      }
      return {
        ...state,
        selectedEventId: action.eventId,
        selectedPersonId: undefined,
        selectedGeometry: undefined,
        geometryState: "idle",
        geometryError: undefined,
        selectionNotice: undefined,
      };

    case "selection/clear":
      return {
        ...state,
        selectedEventId: undefined,
        selectedPersonId: undefined,
        selectedGeometry: undefined,
        geometryState: "idle",
        geometryError: undefined,
        selectionNotice: undefined,
      };

    case "person-selection/set":
      if (
        state.selectedPersonId === action.personId &&
        !state.selectedEventId
      ) {
        return state;
      }
      return {
        ...state,
        selectedEventId: undefined,
        selectedPersonId: action.personId,
        selectedGeometry: undefined,
        geometryState: "idle",
        geometryError: undefined,
        selectionNotice: undefined,
        announcement: "Person location selected.",
      };

    case "person-selection/hidden":
      if (state.selectedPersonId !== action.personId) {
        return state;
      }
      return {
        ...state,
        selectedPersonId: undefined,
        selectionNotice:
          "The selected person has no approved location at this timeline cursor.",
        announcement:
          "Person selection cleared because no approved location applies at this timeline cursor.",
      };

    case "selection/hidden":
      if (state.selectedEventId !== action.eventId) {
        return state;
      }
      return {
        ...state,
        selectedEventId: undefined,
        selectedGeometry: undefined,
        geometryState: "idle",
        geometryError: undefined,
        selectionNotice:
          "The selected event is hidden by the active filters or time cursor.",
        announcement:
          "Selection cleared because the event is hidden by the active filters or time cursor.",
      };

    case "geometry/requested":
      if (state.selectedEventId !== action.eventId) {
        return state;
      }
      return {
        ...state,
        selectedGeometry: undefined,
        geometryState: "loading",
        geometryError: undefined,
      };

    case "geometry/succeeded":
      if (state.selectedEventId !== action.eventId) {
        return state;
      }
      return {
        ...state,
        selectedGeometry: action.geometry,
        geometryState: "ready",
        geometryError: undefined,
      };

    case "geometry/failed":
      if (state.selectedEventId !== action.eventId) {
        return state;
      }
      return {
        ...state,
        selectedGeometry: undefined,
        geometryState: "error",
        geometryError: action.message,
      };

    case "geometry/retry":
      if (!state.selectedEventId || state.geometryState === "loading") {
        return state;
      }
      return {
        ...state,
        selectedGeometry: undefined,
        geometryState: "idle",
        geometryError: undefined,
        geometryRequestVersion: state.geometryRequestVersion + 1,
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

    case "filters/category-toggle":
      return {
        ...state,
        filters: {
          ...state.filters,
          categories: toggleValue(state.filters.categories, action.category),
        },
      };

    case "filters/priority-toggle":
      return {
        ...state,
        filters: {
          ...state.filters,
          priorities: toggleValue(state.filters.priorities, action.priority),
        },
      };

    case "filters/source-toggle":
      return {
        ...state,
        filters: {
          ...state.filters,
          sources: toggleValue(state.filters.sources, action.source),
        },
      };

    case "filters/lifecycle-toggle":
      return {
        ...state,
        filters: {
          ...state.filters,
          lifecycle: toggleValue(state.filters.lifecycle, action.lifecycle),
        },
      };

    case "filters/time-cursor-set":
      return {
        ...state,
        filters: { ...state.filters, timeCursor: action.timeCursor },
      };

    case "filters/reset-visibility":
      return {
        ...state,
        filters: {
          ...state.filters,
          categories: [...HAZARD_CATEGORIES],
          priorities: ["low", "medium", "high", "critical"],
          sources: ["usgs", "gdacs", "spc"],
          lifecycle: ["ongoing", "occurred", "ended", "unknown"],
          query: "",
          timeCursor: action.timeCursor,
        },
      };
  }
}
