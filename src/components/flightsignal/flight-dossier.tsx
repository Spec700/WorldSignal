"use client";

import { useState, useTransition } from "react";

import {
  cancelFlightAssignmentAction,
  completeTravelerFlightAction,
  confirmTravelerOnboardAction,
  refreshTrackedFlightAction,
} from "@/app/flightsignal/actions";
import { LocalTimestamp } from "@/components/local-timestamp";
import type { FlightSignalActionState } from "@/features/flights/action-state";
import type { TrackedFlightDto } from "@/features/flights/types";

import styles from "@/app/flightsignal/flightsignal.module.css";

export const flightStatusLabels = {
  scheduled: "Scheduled by analyst",
  awaiting_signal: "Awaiting ADS-B signal",
  match_required: "Aircraft match required",
  live_airborne: "Live · airborne",
  live_ground: "Live · on ground",
  signal_stale: "Signal stale",
  source_error: "Source unavailable",
  possible_arrival: "Possible arrival",
  completed: "Travel complete",
  cancelled: "Cancelled",
} as const;

function formatNumber(value: number | undefined, suffix: string) {
  return value === undefined
    ? "Not observed"
    : `${Math.round(value).toLocaleString()} ${suffix}`;
}

export function FlightDossier({
  activeOperatorId,
  flight,
  onClose,
  onRefresh,
}: {
  activeOperatorId: string;
  flight: TrackedFlightDto;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<FlightSignalActionState>();
  const observation = flight.latestObservation;

  function runAction(
    action: (formData: FormData) => Promise<FlightSignalActionState>,
    values: Record<string, string>,
  ) {
    const formData = new FormData();
    formData.set("actorOperatorId", activeOperatorId);
    for (const [key, value] of Object.entries(values)) {
      formData.set(key, value);
    }
    startTransition(async () => {
      const result = await action(formData);
      setMessage(result);
      if (result.status === "success") {
        onRefresh();
      }
    });
  }

  return (
    <aside
      aria-label={`${flight.passengerFlightNumber} flight dossier`}
      className={styles.dossier}
    >
      <header className={styles.panelHeader}>
        <span className={styles.eyebrow}>Flight dossier</span>
        <button
          aria-label="Close flight dossier"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
        <span
          className={styles.flightStatus}
          data-status={flight.displayStatus}
        >
          {flightStatusLabels[flight.displayStatus]}
        </span>
        <h2>{flight.passengerFlightNumber}</h2>
        <p>
          {flight.origin.iata} → {flight.destination.iata} · ADS-B callsign{" "}
          {flight.adsbCallsign}
        </p>
      </header>

      <div className={styles.dossierBody}>
        <section className={styles.dossierSection}>
          <h3>Traveler assignments</h3>
          <ul className={styles.assignmentList}>
            {flight.assignments.map((assignment) => (
              <li key={assignment.id}>
                <div>
                  <strong>{assignment.person.displayName}</strong>
                  <small>
                    {assignment.person.organization ?? "Independent"} ·{" "}
                    {assignment.person.tier}
                  </small>
                </div>
                <span data-status={assignment.status}>
                  {assignment.status === "onboard_confirmed"
                    ? "Travel mode"
                    : assignment.status}
                </span>
                <div className={styles.assignmentActions}>
                  {assignment.status === "planned" && flight.aircraftIcaoHex ? (
                    <button
                      disabled={pending}
                      onClick={() =>
                        runAction(confirmTravelerOnboardAction, {
                          assignmentId: assignment.id,
                        })
                      }
                      type="button"
                    >
                      Confirm onboard
                    </button>
                  ) : null}
                  {assignment.status === "onboard_confirmed" &&
                  flight.displayStatus === "possible_arrival" ? (
                    <button
                      disabled={pending}
                      onClick={() =>
                        runAction(completeTravelerFlightAction, {
                          assignmentId: assignment.id,
                        })
                      }
                      type="button"
                    >
                      Complete travel
                    </button>
                  ) : null}
                  {assignment.status === "planned" ||
                  assignment.status === "onboard_confirmed" ? (
                    <button
                      className={styles.dangerAction}
                      disabled={pending}
                      onClick={() =>
                        runAction(cancelFlightAssignmentAction, {
                          assignmentId: assignment.id,
                        })
                      }
                      type="button"
                    >
                      Cancel assignment
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <p className={styles.sourceCaveat}>
            ADS-B identifies an aircraft, not a passenger. Aircraft position
            represents a person only after “Confirm onboard.”
          </p>
        </section>

        <section className={styles.dossierSection}>
          <h3>Confirmed itinerary</h3>
          <dl className={styles.factList}>
            <div>
              <dt>Origin</dt>
              <dd>{flight.origin.name}</dd>
            </div>
            <div>
              <dt>Destination</dt>
              <dd>{flight.destination.name}</dd>
            </div>
            <div>
              <dt>Departure</dt>
              <dd>
                <LocalTimestamp timestamp={flight.scheduledDepartureAt} />
              </dd>
            </div>
            <div>
              <dt>Arrival</dt>
              <dd>
                {flight.scheduledArrivalAt ? (
                  <LocalTimestamp timestamp={flight.scheduledArrivalAt} />
                ) : (
                  "Not supplied"
                )}
              </dd>
            </div>
          </dl>
          <p className={styles.sourceCaveat}>
            Schedule values are analyst supplied. They are not live airline
            operational data.
          </p>
        </section>

        <section className={styles.dossierSection}>
          <div className={styles.dossierSectionHeading}>
            <h3>AirLabs observation</h3>
            {!(["completed", "cancelled"] as string[]).includes(
              flight.trackingStatus,
            ) ? (
              <button
                disabled={pending}
                onClick={() =>
                  runAction(refreshTrackedFlightAction, {
                    flightInstanceId: flight.id,
                  })
                }
                type="button"
              >
                Refresh now
              </button>
            ) : null}
          </div>
          {observation ? (
            <dl className={styles.factList}>
              <div>
                <dt>Aircraft</dt>
                <dd>
                  {observation.registration ?? observation.aircraftIcaoHex}
                  {observation.aircraftType
                    ? ` · ${observation.aircraftType}`
                    : ""}
                </dd>
              </div>
              <div>
                <dt>Altitude</dt>
                <dd>
                  {observation.onGround
                    ? "Ground"
                    : formatNumber(observation.barometricAltitudeFeet, "ft")}
                </dd>
              </div>
              <div>
                <dt>Ground speed</dt>
                <dd>{formatNumber(observation.groundSpeedKnots, "kt")}</dd>
              </div>
              <div>
                <dt>Track</dt>
                <dd>{formatNumber(observation.trackDegrees, "°")}</dd>
              </div>
              <div>
                <dt>Observed</dt>
                <dd>
                  <LocalTimestamp timestamp={observation.sourceObservedAt} />
                </dd>
              </div>
            </dl>
          ) : (
            <p className={styles.emptyCopy}>
              No AirLabs position observation has been stored for this dated
              flight yet.
            </p>
          )}
          {flight.lastSourceError ? (
            <p className={styles.formError}>{flight.lastSourceError}</p>
          ) : null}
        </section>

        {message ? (
          <p
            className={styles.actionMessage}
            data-status={message.status}
            role="status"
          >
            {message.message}
          </p>
        ) : null}
      </div>
    </aside>
  );
}
