"use client";

import { useActionState, useEffect, useState, useTransition } from "react";

import {
  createTrackedFlightAction,
  lookupFlightRouteAction,
} from "@/app/flightsignal/actions";
import {
  initialFlightSignalActionState,
  type FlightRouteLookupState,
} from "@/features/flights/action-state";
import { LocalTimestamp } from "@/components/local-timestamp";
import type { FlightPersonDto } from "@/features/flights/types";

import styles from "@/app/flightsignal/flightsignal.module.css";

export function TrackFlightEditor({
  activeOperatorId,
  onClose,
  onCreated,
  people,
}: {
  activeOperatorId: string;
  onClose: () => void;
  onCreated: (flightInstanceId: string) => void;
  people: FlightPersonDto[];
}) {
  const [actionState, formAction, saving] = useActionState(
    createTrackedFlightAction,
    initialFlightSignalActionState,
  );
  const [flightNumber, setFlightNumber] = useState("");
  const [route, setRoute] = useState<FlightRouteLookupState>();
  const [routePending, startRouteLookup] = useTransition();
  const activePeople = people.filter((person) => person.status === "active");
  const resolvedFlight = route?.status === "success" ? route.flight : undefined;

  useEffect(() => {
    if (actionState.status === "success" && actionState.flightInstanceId) {
      onCreated(actionState.flightInstanceId);
    }
  }, [actionState, onCreated]);

  function invalidateRoute() {
    setRoute(undefined);
  }

  function lookupRoute() {
    startRouteLookup(async () => {
      const result = await lookupFlightRouteAction(flightNumber);
      setRoute(result);
    });
  }

  return (
    <aside aria-label="Track a flight" className={styles.editor}>
      <header className={styles.panelHeader}>
        <span className={styles.eyebrow}>New assignment</span>
        <button
          aria-label="Close flight editor"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
        <h2>Track a flight</h2>
        <p>
          AirLabs resolves the dated itinerary and aircraft. Travel mode still
          requires an explicit onboard confirmation.
        </p>
      </header>

      <form action={formAction} className={styles.editorForm}>
        <input name="actorOperatorId" type="hidden" value={activeOperatorId} />
        <input
          name="confirmationToken"
          type="hidden"
          value={route?.status === "success" ? route.confirmationToken : ""}
        />

        <section className={styles.formSection}>
          <span className={styles.formSectionLabel}>1 · Resolve flight</span>
          <label className={styles.field}>
            <span>Passenger flight ID</span>
            <input
              autoComplete="off"
              onChange={(event) => {
                setFlightNumber(event.target.value);
                invalidateRoute();
              }}
              placeholder="AA 333"
              value={flightNumber}
            />
            <small>
              Airline code and flight number; this lookup uses one AirLabs
              request.
            </small>
          </label>
          <button
            className={styles.secondaryAction}
            disabled={!flightNumber.trim() || routePending}
            onClick={lookupRoute}
            type="button"
          >
            {routePending ? "Checking AirLabs…" : "Find current flight"}
          </button>
          {route?.status === "error" ? (
            <p className={styles.formError} role="alert">
              {route.message}
            </p>
          ) : null}
          {resolvedFlight ? (
            <div className={styles.routeConfirmation}>
              <span>AirLabs match · {resolvedFlight.providerStatus}</span>
              <p>
                <strong>{resolvedFlight.passengerFlightNumber}</strong> ·{" "}
                {resolvedFlight.origin.iata} → {resolvedFlight.destination.iata}
              </p>
              <small>
                {resolvedFlight.origin.name} → {resolvedFlight.destination.name}
              </small>
              <dl className={styles.factList}>
                <div>
                  <dt>Scheduled departure</dt>
                  <dd>
                    <LocalTimestamp
                      timestamp={resolvedFlight.scheduledDepartureAt}
                    />
                  </dd>
                </div>
                <div>
                  <dt>Scheduled arrival</dt>
                  <dd>
                    {resolvedFlight.scheduledArrivalAt ? (
                      <LocalTimestamp
                        timestamp={resolvedFlight.scheduledArrivalAt}
                      />
                    ) : (
                      "Unavailable"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Aircraft</dt>
                  <dd>
                    {resolvedFlight.aircraftRegistration ??
                      resolvedFlight.aircraftModel ??
                      resolvedFlight.aircraftType ??
                      (resolvedFlight.phase === "active"
                        ? "Not reported in this response"
                        : "Assigned closer to departure")}
                  </dd>
                </div>
                <div>
                  <dt>Live position</dt>
                  <dd>
                    {resolvedFlight.observation
                      ? `${resolvedFlight.observation.latitude.toFixed(3)}, ${resolvedFlight.observation.longitude.toFixed(3)}`
                      : "Not reported in this response"}
                  </dd>
                </div>
                <div>
                  <dt>Gate</dt>
                  <dd>
                    {resolvedFlight.departureGate ?? "—"} →{" "}
                    {resolvedFlight.destinationGate ?? "—"}
                  </dd>
                </div>
              </dl>
              <small>
                Match expires after 15 minutes so stale schedule data cannot be
                assigned.
              </small>
            </div>
          ) : null}
        </section>

        <section className={styles.formSection}>
          <span className={styles.formSectionLabel}>2 · Assign traveler</span>
          <label className={styles.field}>
            <span>Person</span>
            <select name="personId" defaultValue="" required>
              <option disabled value="">
                Select a person
              </option>
              {activePeople.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.displayName}
                  {person.organization ? ` · ${person.organization}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Operator notes · optional</span>
            <textarea
              name="notes"
              placeholder="Trip context or verification notes"
              rows={3}
            />
          </label>
        </section>

        {actionState.status === "error" ? (
          <p className={styles.actionMessage} data-status="error" role="alert">
            {actionState.message}
          </p>
        ) : null}
        <footer className={styles.editorFooter}>
          <button
            className={styles.cancelAction}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className={styles.primaryFormAction}
            disabled={!resolvedFlight || saving}
            type="submit"
          >
            {saving ? "Assigning…" : "Assign flight"}
          </button>
        </footer>
      </form>
    </aside>
  );
}
