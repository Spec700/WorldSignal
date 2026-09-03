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
import type { FlightPersonDto } from "@/features/flights/types";

import styles from "@/app/flightsignal/flightsignal.module.css";

function localDateTimeToIso(value: string): string {
  return value ? new Date(value).toISOString() : "";
}

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
  const [callsignOverride, setCallsignOverride] = useState("");
  const [route, setRoute] = useState<FlightRouteLookupState>();
  const [selectedLegIndex, setSelectedLegIndex] = useState(0);
  const [departureLocal, setDepartureLocal] = useState("");
  const [arrivalLocal, setArrivalLocal] = useState("");
  const [routePending, startRouteLookup] = useTransition();
  const activePeople = people.filter((person) => person.status === "active");
  const airports = route?.status === "success" ? (route.airports ?? []) : [];
  const origin = airports[selectedLegIndex];
  const destination = airports[selectedLegIndex + 1];

  useEffect(() => {
    if (actionState.status === "success" && actionState.flightInstanceId) {
      onCreated(actionState.flightInstanceId);
    }
  }, [actionState, onCreated]);

  function invalidateRoute() {
    setRoute(undefined);
    setSelectedLegIndex(0);
  }

  function lookupRoute() {
    startRouteLookup(async () => {
      const result = await lookupFlightRouteAction(
        flightNumber,
        callsignOverride || undefined,
      );
      setRoute(result);
      setSelectedLegIndex(0);
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
          Confirm the dated itinerary first. An aircraft and traveler still
          require separate operator confirmation.
        </p>
      </header>

      <form action={formAction} className={styles.editorForm}>
        <input name="actorOperatorId" type="hidden" value={activeOperatorId} />
        <input
          name="passengerFlightNumber"
          type="hidden"
          value={route?.passengerFlightNumber ?? flightNumber}
        />
        <input
          name="adsbCallsign"
          type="hidden"
          value={route?.adsbCallsign ?? callsignOverride}
        />
        <input name="originIata" type="hidden" value={origin?.iata ?? ""} />
        <input name="originName" type="hidden" value={origin?.name ?? ""} />
        <input
          name="originLatitude"
          type="hidden"
          value={origin?.latitude ?? ""}
        />
        <input
          name="originLongitude"
          type="hidden"
          value={origin?.longitude ?? ""}
        />
        <input
          name="destinationIata"
          type="hidden"
          value={destination?.iata ?? ""}
        />
        <input
          name="destinationName"
          type="hidden"
          value={destination?.name ?? ""}
        />
        <input
          name="destinationLatitude"
          type="hidden"
          value={destination?.latitude ?? ""}
        />
        <input
          name="destinationLongitude"
          type="hidden"
          value={destination?.longitude ?? ""}
        />
        <input
          name="scheduledDepartureAt"
          type="hidden"
          value={localDateTimeToIso(departureLocal)}
        />
        <input
          name="scheduledArrivalAt"
          type="hidden"
          value={localDateTimeToIso(arrivalLocal)}
        />

        <section className={styles.formSection}>
          <span className={styles.formSectionLabel}>1 · Identify route</span>
          <label className={styles.field}>
            <span>Passenger flight ID</span>
            <input
              autoComplete="off"
              onChange={(event) => {
                setFlightNumber(event.target.value);
                invalidateRoute();
              }}
              placeholder="UA 2276"
              value={flightNumber}
            />
            <small>Airline code and flight number; spaces are optional.</small>
          </label>
          <label className={styles.field}>
            <span>ADS-B callsign override · optional</span>
            <input
              autoComplete="off"
              onChange={(event) => {
                setCallsignOverride(event.target.value);
                invalidateRoute();
              }}
              placeholder="Only needed for an unmapped carrier"
              value={callsignOverride}
            />
          </label>
          <button
            className={styles.secondaryAction}
            disabled={!flightNumber.trim() || routePending}
            onClick={lookupRoute}
            type="button"
          >
            {routePending ? "Checking route…" : "Check route suggestion"}
          </button>
          {route?.status === "error" ? (
            <p className={styles.formError} role="alert">
              {route.message}
            </p>
          ) : null}
          {airports.length >= 2 ? (
            <div className={styles.routeConfirmation}>
              <span>Community route suggestion · confirm exact leg</span>
              <label className={styles.field}>
                <span>Intended leg</span>
                <select
                  aria-label="Intended route leg"
                  onChange={(event) =>
                    setSelectedLegIndex(Number(event.target.value))
                  }
                  value={selectedLegIndex}
                >
                  {airports.slice(0, -1).map((airport, index) => (
                    <option key={`${airport.iata}-${index}`} value={index}>
                      {airport.iata} → {airports[index + 1]?.iata}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                {origin?.name} → {destination?.name}
              </p>
              <small>
                Crowdsourced route data is a suggestion, not an airline
                schedule. Choose the exact intended leg.
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
            <span>Scheduled departure · your local time</span>
            <input
              onChange={(event) => setDepartureLocal(event.target.value)}
              required
              type="datetime-local"
              value={departureLocal}
            />
          </label>
          <label className={styles.field}>
            <span>Scheduled arrival · optional · your local time</span>
            <input
              min={departureLocal || undefined}
              onChange={(event) => setArrivalLocal(event.target.value)}
              type="datetime-local"
              value={arrivalLocal}
            />
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
            disabled={!origin || !destination || !departureLocal || saving}
            type="submit"
          >
            {saving ? "Assigning…" : "Assign flight"}
          </button>
        </footer>
      </form>
    </aside>
  );
}
