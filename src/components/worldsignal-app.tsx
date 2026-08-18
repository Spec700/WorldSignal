"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { CommandBar } from "@/components/command-bar/command-bar";
import { EventDossier } from "@/components/dossier/event-dossier";
import { OperationalStage } from "@/components/globe/operational-stage";
import { OperationsRail } from "@/components/operations-rail/operations-rail";
import {
  HazardBatchRequestError,
  loadHazardBatch,
} from "@/features/hazards/client/load-hazard-batch";
import {
  getGdacsGeometryRequest,
  loadGdacsGeometry,
} from "@/features/hazards/client/load-gdacs-geometry";
import { selectVisibleEvents } from "@/lib/events/filtering";
import { sortEventsByPriority } from "@/lib/events/sorting";
import type { HazardWindow, WorldEvent } from "@/lib/events/types";
import {
  useWorldSignalDispatch,
  useWorldSignalState,
  WorldSignalProvider,
} from "@/state/worldsignal-context";

const EMPTY_EVENTS: WorldEvent[] = [];

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

  const refresh = useCallback(async () => {
    if (requestInFlightRef.current) {
      return;
    }

    requestInFlightRef.current = true;
    dispatch({ type: "refresh/started" });

    try {
      const batch = await loadHazardBatch(state.filters.window);
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
  }, [dispatch, state.filters.window]);

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
  const visibleEvents = useMemo(
    () =>
      sortEventsByPriority(selectVisibleEvents(loadedEvents, state.filters)),
    [loadedEvents, state.filters],
  );
  const selectedEvent = state.selectedEventId
    ? loadedEvents.find((event) => event.id === state.selectedEventId)
    : undefined;
  const refreshing = state.refreshState === "loading";

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
      dispatch({ type: "filters/window-set", window });
    },
    [dispatch],
  );

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
          changesByEventId={state.changesByEventId}
          events={visibleEvents}
          onQueryChange={(query) =>
            dispatch({ type: "filters/query-set", query })
          }
          onSelect={(eventId) => dispatch({ type: "selection/set", eventId })}
          onWindowChange={handleWindowChange}
          query={state.filters.query}
          refreshing={refreshing}
          searchInputRef={searchInputRef}
          selectedEventId={state.selectedEventId}
          sourceHealth={state.latestSourceHealth}
          window={state.filters.window}
        />
        <OperationalStage
          batchIsPrevious={state.batchFreshness === "previous"}
          events={visibleEvents}
          hasActiveQuery={Boolean(state.filters.query.trim())}
          hasLoadedBatch={Boolean(state.batch)}
          loadedCount={loadedEvents.length}
          onClearQuery={() =>
            dispatch({ type: "filters/query-set", query: "" })
          }
          onClearSelection={() => dispatch({ type: "selection/clear" })}
          onRefresh={() => void refresh()}
          onSelect={(eventId) => dispatch({ type: "selection/set", eventId })}
          refreshError={state.refreshError}
          refreshing={refreshing}
          selectedGeometry={state.selectedGeometry}
          selectedEvent={selectedEvent}
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
