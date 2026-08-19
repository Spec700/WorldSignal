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
  createHazardSnapshot,
  readHazardSnapshot,
  readMostRecentHazardSnapshot,
  setActiveHazardWindow,
  writeHazardSnapshot,
} from "@/features/hazards/client/hazard-snapshot-store";
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
const DEFAULT_HAZARD_WINDOW: HazardWindow = "7d";
const HAZARD_CATEGORIES: EventCategory[] = [
  "earthquake",
  "tropical-cyclone",
  "flood",
  "drought",
  "tornado",
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
  const rangeChangeInFlightRef = useRef(false);
  const restoring = state.cacheState === "checking";

  useEffect(() => {
    let cancelled = false;

    void readMostRecentHazardSnapshot(DEFAULT_HAZARD_WINDOW)
      .then(({ window, snapshot }) => {
        if (cancelled) {
          return;
        }
        dispatch(
          snapshot
            ? { type: "cache/restored", snapshot }
            : { type: "cache/missed", window },
        );
      })
      .catch(() => {
        if (!cancelled) {
          dispatch({
            type: "cache/restore-failed",
            window: DEFAULT_HAZARD_WINDOW,
            message:
              "WorldSignal could not read browser-local snapshot storage. Manual retrieval remains available.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  const refresh = useCallback(
    async (windowOverride?: HazardWindow) => {
      if (requestInFlightRef.current || state.cacheState === "checking") {
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
    [dispatch, state.cacheState, state.filters.window],
  );

  useEffect(() => {
    if (state.cacheState !== "saving" || !state.batch) {
      return;
    }

    const batch = state.batch;
    const window = state.filters.window;
    let cancelled = false;

    void (async () => {
      try {
        const snapshot = createHazardSnapshot({
          window,
          batch,
          previousEventsById: state.previousEventsById,
          changesByEventId: state.changesByEventId,
        });
        await writeHazardSnapshot(snapshot);
        if (!cancelled) {
          dispatch({
            type: "cache/saved",
            generatedAt: batch.generatedAt,
            window,
          });
        }
      } catch {
        if (!cancelled) {
          dispatch({
            type: "cache/save-failed",
            generatedAt: batch.generatedAt,
            window,
            message:
              "WorldSignal loaded current events but could not store the snapshot in this browser.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    dispatch,
    state.batch,
    state.cacheState,
    state.changesByEventId,
    state.filters.window,
    state.previousEventsById,
  ]);

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
  const categoryCountEvents = useMemo(
    () =>
      selectVisibleEvents(loadedEvents, {
        ...state.filters,
        categories: HAZARD_CATEGORIES,
      }),
    [loadedEvents, state.filters],
  );
  const categoryCounts = useMemo(() => {
    const counts = new Map<EventCategory, number>(
      HAZARD_CATEGORIES.map((category) => [category, 0]),
    );
    for (const event of categoryCountEvents) {
      if (counts.has(event.category)) {
        counts.set(event.category, (counts.get(event.category) ?? 0) + 1);
      }
    }
    return counts;
  }, [categoryCountEvents]);
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
    async (window: HazardWindow) => {
      if (
        window === state.filters.window ||
        refreshing ||
        restoring ||
        rangeChangeInFlightRef.current
      ) {
        return;
      }
      dispatch({ type: "filters/window-set", window });

      if (!state.batch) {
        return;
      }

      rangeChangeInFlightRef.current = true;
      dispatch({ type: "cache/restore-started" });
      try {
        const snapshot = await readHazardSnapshot(window);
        if (snapshot) {
          dispatch({ type: "cache/restored", snapshot });
          try {
            await setActiveHazardWindow(window);
          } catch {
            dispatch({
              type: "cache/restore-failed",
              window,
              message:
                "WorldSignal restored the snapshot but could not remember the selected range in this browser.",
            });
          }
          return;
        }

        dispatch({ type: "cache/missed", window });
        await refresh(window);
      } catch {
        dispatch({
          type: "cache/restore-failed",
          window,
          message:
            "WorldSignal could not read this range from browser-local storage.",
        });
        await refresh(window);
      } finally {
        rangeChangeInFlightRef.current = false;
      }
    },
    [
      dispatch,
      refresh,
      refreshing,
      restoring,
      state.batch,
      state.filters.window,
    ],
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
        batchOrigin={state.batchOrigin}
        batchIsPrevious={state.batchFreshness === "previous"}
        cacheState={state.cacheState}
        generatedAt={state.batch?.generatedAt}
        hasLoadedBatch={Boolean(state.batch)}
        loadedCount={loadedEvents.length}
        onRefresh={() => void refresh()}
        refreshing={refreshing}
        sourceHealth={state.latestSourceHealth}
        visibleCount={visibleEvents.length}
        window={state.filters.window}
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
          matchingBeforeTimeCount={preTimeEvents.length}
          onClearFilters={clearVisibilityFilters}
          onClearSelection={() => dispatch({ type: "selection/clear" })}
          onRefresh={() => void refresh()}
          onSelect={(eventId) => dispatch({ type: "selection/set", eventId })}
          refreshError={state.refreshError}
          refreshing={refreshing}
          restoring={restoring}
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
        restoring={restoring}
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
