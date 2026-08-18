"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { CommandBar } from "@/components/command-bar/command-bar";
import { EventDossier } from "@/components/dossier/event-dossier";
import { OperationalStage } from "@/components/globe/operational-stage";
import { OperationsRail } from "@/components/operations-rail/operations-rail";
import { HazardTimeline } from "@/components/timeline/hazard-timeline";
import {
  HazardBatchRequestError,
  loadHazardBatch,
} from "@/features/hazards/client/load-hazard-batch";
import {
  getGdacsGeometryRequest,
  loadGdacsGeometry,
} from "@/features/hazards/client/load-gdacs-geometry";
import {
  selectEventsBeforeTimeCursor,
  selectVisibleEvents,
} from "@/lib/events/filtering";
import { sortEventsByPriority } from "@/lib/events/sorting";
import type {
  EventCategory,
  HazardWindow,
  WorldEvent,
} from "@/lib/events/types";
import {
  useWorldSignalDispatch,
  useWorldSignalState,
  WorldSignalProvider,
} from "@/state/worldsignal-context";

const EMPTY_EVENTS: WorldEvent[] = [];
const HAZARD_CATEGORIES: EventCategory[] = [
  "earthquake",
  "tropical-cyclone",
  "flood",
  "drought",
  "volcano",
  "wildfire",
];

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function WorldSignalWorkspace() {
  const state = useWorldSignalState();
  const dispatch = useWorldSignalDispatch();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const requestInFlightRef = useRef(false);

  const refresh = useCallback(
    async (windowOverride?: HazardWindow) => {
      if (requestInFlightRef.current) {
        return;
      }

      requestInFlightRef.current = true;
      dispatch({ type: "refresh/started" });

      try {
        const batch = await loadHazardBatch(
          windowOverride ?? state.filters.window,
        );
        dispatch({ type: "refresh/succeeded", batch });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "WorldSignal could not reach the local hazard route.";
        dispatch({
          type: "refresh/failed",
          message,
          ...(error instanceof HazardBatchRequestError && error.sources
            ? { sources: error.sources }
            : {}),
        });
      } finally {
        requestInFlightRef.current = false;
      }
    },
    [dispatch, state.filters.window],
  );

  useEffect(() => {
    function handleKeyboardShortcut(event: KeyboardEvent) {
      const editable = isEditableTarget(event.target);

      if (event.key === "Escape" && state.selectedEventId) {
        dispatch({ type: "selection/clear" });
        return;
      }

      if (
        (event.key === "/" && !editable) ||
        (event.key.toLocaleLowerCase() === "k" &&
          (event.metaKey || event.ctrlKey))
      ) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (event.key.toLocaleLowerCase() === "r" && !editable) {
        event.preventDefault();
        void refresh();
      }
    }

    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, [dispatch, refresh, state.selectedEventId]);

  const loadedEvents = state.batch ? state.batch.events : EMPTY_EVENTS;
  const preTimeEvents = useMemo(
    () =>
      sortEventsByPriority(
        selectEventsBeforeTimeCursor(loadedEvents, state.filters),
      ),
    [loadedEvents, state.filters],
  );
  const visibleEvents = useMemo(
    () =>
      sortEventsByPriority(selectVisibleEvents(loadedEvents, state.filters)),
    [loadedEvents, state.filters],
  );
  const categoryCounts = useMemo(() => {
    const counts = new Map<EventCategory, number>(
      HAZARD_CATEGORIES.map((category) => [category, 0]),
    );
    for (const event of loadedEvents) {
      if (counts.has(event.category)) {
        counts.set(event.category, (counts.get(event.category) ?? 0) + 1);
      }
    }
    return counts;
  }, [loadedEvents]);
  const selectedEvent = state.selectedEventId
    ? visibleEvents.find((event) => event.id === state.selectedEventId)
    : undefined;
  const refreshing = state.refreshState === "loading";

  useEffect(() => {
    if (state.selectedEventId && !selectedEvent) {
      dispatch({ type: "selection/hidden", eventId: state.selectedEventId });
    }
  }, [dispatch, selectedEvent, state.selectedEventId]);

  useEffect(() => {
    if (!selectedEvent?.geometryDetailAvailable) {
      return;
    }

    const request = getGdacsGeometryRequest(selectedEvent);
    if (!request) {
      dispatch({
        type: "geometry/failed",
        eventId: selectedEvent.id,
        message:
          "Detailed geometry parameters are unavailable for this event. The source centroid and report remain available.",
      });
      return;
    }

    const controller = new AbortController();
    dispatch({ type: "geometry/requested", eventId: selectedEvent.id });
    void loadGdacsGeometry(request, controller.signal)
      .then((geometry) =>
        dispatch({
          type: "geometry/succeeded",
          eventId: selectedEvent.id,
          geometry,
        }),
      )
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        dispatch({
          type: "geometry/failed",
          eventId: selectedEvent.id,
          message:
            error instanceof Error
              ? error.message
              : "Detailed geometry is unavailable for this event. The source centroid and report remain available.",
        });
      });

    return () => controller.abort();
  }, [dispatch, selectedEvent, state.geometryRequestVersion]);

  const handleWindowChange = useCallback(
    (window: HazardWindow) => {
      if (window === state.filters.window || refreshing) {
        return;
      }
      dispatch({ type: "filters/window-set", window });

      if (state.batch) {
        void refresh(window);
      }
    },
    [dispatch, refresh, refreshing, state.batch, state.filters.window],
  );

  const clearVisibilityFilters = useCallback(() => {
    dispatch({
      type: "filters/reset-visibility",
      timeCursor: state.batch?.requestedRange.to ?? "",
    });
  }, [dispatch, state.batch?.requestedRange.to]);

  return (
    <div className="worldsignal-shell">
      <a className="skip-link" href="#main-content">
        Skip to operational view
      </a>
      <CommandBar
        batchIsPrevious={state.batchFreshness === "previous"}
        generatedAt={state.batch?.generatedAt}
        hasLoadedBatch={Boolean(state.batch)}
        loadedCount={loadedEvents.length}
        onRefresh={() => void refresh()}
        refreshing={refreshing}
        sourceHealth={state.latestSourceHealth}
        visibleCount={visibleEvents.length}
      />
      <div className={`workspace-grid${selectedEvent ? " has-dossier" : ""}`}>
        <OperationsRail
          categoryCounts={categoryCounts}
          changesByEventId={state.changesByEventId}
          events={visibleEvents}
          filters={state.filters}
          onCategoryToggle={(category) =>
            dispatch({ type: "filters/category-toggle", category })
          }
          onLifecycleToggle={(lifecycle) =>
            dispatch({ type: "filters/lifecycle-toggle", lifecycle })
          }
          onPriorityToggle={(priority) =>
            dispatch({ type: "filters/priority-toggle", priority })
          }
          onQueryChange={(query) =>
            dispatch({ type: "filters/query-set", query })
          }
          onSelect={(eventId) => dispatch({ type: "selection/set", eventId })}
          onSourceToggle={(source) =>
            dispatch({ type: "filters/source-toggle", source })
          }
          refreshing={refreshing}
          searchInputRef={searchInputRef}
          selectedEventId={state.selectedEventId}
          sourceHealth={state.latestSourceHealth}
        />
        <OperationalStage
          batchIsPrevious={state.batchFreshness === "previous"}
          events={visibleEvents}
          hasLoadedBatch={Boolean(state.batch)}
          loadedCount={loadedEvents.length}
          onClearFilters={clearVisibilityFilters}
          onClearSelection={() => dispatch({ type: "selection/clear" })}
          onRefresh={() => void refresh()}
          onSelect={(eventId) => dispatch({ type: "selection/set", eventId })}
          refreshError={state.refreshError}
          refreshing={refreshing}
          selectedGeometry={state.selectedGeometry}
          selectedEvent={selectedEvent}
          selectionNotice={state.selectionNotice}
          visibleCount={visibleEvents.length}
        />
        {selectedEvent ? (
          <EventDossier
            change={state.changesByEventId.get(selectedEvent.id)}
            event={selectedEvent}
            geometry={state.selectedGeometry}
            geometryError={state.geometryError}
            geometryState={state.geometryState}
            onClose={() => dispatch({ type: "selection/clear" })}
            onRetryGeometry={() => dispatch({ type: "geometry/retry" })}
            sourceHealth={state.latestSourceHealth}
          />
        ) : null}
      </div>
      <HazardTimeline
        batch={state.batch}
        changesByEventId={state.changesByEventId}
        cursor={state.filters.timeCursor}
        events={preTimeEvents}
        onCursorChange={(timeCursor) =>
          dispatch({ type: "filters/time-cursor-set", timeCursor })
        }
        onWindowChange={handleWindowChange}
        refreshing={refreshing}
        visibleEvents={visibleEvents}
        window={state.filters.window}
      />
      <div aria-live="polite" className="sr-only" role="status">
        {state.announcement}
      </div>
    </div>
  );
}

export function WorldSignalApp() {
  return (
    <WorldSignalProvider>
      <WorldSignalWorkspace />
    </WorldSignalProvider>
  );
}
