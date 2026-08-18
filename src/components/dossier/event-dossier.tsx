import { EventIcon, eventCategoryLabel } from "@/components/event-icon";
import type { EventChange } from "@/lib/events/change-detection";
import type { SourceHealth, WorldEvent } from "@/lib/events/types";
import type { GdacsGeometryCollection } from "@/lib/sources/gdacs/geometry";
import { formatLocalTimestamp } from "@/lib/time/format";

interface EventDossierProps {
  event: WorldEvent;
  change?: EventChange;
  sourceHealth: SourceHealth[];
  geometry?: GdacsGeometryCollection;
  geometryState: "idle" | "loading" | "ready" | "error";
  geometryError?: string;
  onClose: () => void;
  onRetryGeometry: () => void;
}

function formatUtcTimestamp(timestamp: string): string {
  return `${timestamp.replace("T", " ").replace(".000Z", "Z")} (UTC)`;
}

function formatFactValue(value: string | number | boolean, unit?: string) {
  const formatted =
    typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

function verificationLabel(verification: WorldEvent["verification"]): string {
  return verification
    .split("-")
    .map((word) => word[0]?.toLocaleUpperCase() + word.slice(1))
    .join(" ");
}

function sourceState(
  source: WorldEvent["sources"][number],
  health: SourceHealth[],
) {
  return health.find((item) => item.source === source.source);
}

function TimestampRow({
  label,
  timestamp,
}: {
  label: string;
  timestamp?: string;
}) {
  if (!timestamp) return null;

  return (
    <div className="dossier-timestamp-row">
      <dt>{label}</dt>
      <dd>
        <time dateTime={timestamp}>
          {formatLocalTimestamp(timestamp, "full")}
        </time>
        <small>{formatUtcTimestamp(timestamp)}</small>
      </dd>
    </div>
  );
}

export function EventDossier({
  event,
  change,
  sourceHealth,
  geometry,
  geometryState,
  geometryError,
  onClose,
  onRetryGeometry,
}: EventDossierProps) {
  const countries = event.countryCodes.join(" · ") || "Not specified";

  return (
    <aside className="event-dossier" aria-labelledby="dossier-title">
      <header className="dossier-header">
        <span>Event dossier</span>
        <button
          aria-label="Close event dossier"
          onClick={onClose}
          type="button"
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <div className="dossier-scroll">
        <section className="dossier-identity">
          <div className="dossier-category-line">
            <EventIcon category={event.category} />
            <span>
              <span>{eventCategoryLabel(event.category)}</span>
              <small>{event.lifecycle}</small>
            </span>
            {change && change !== "unchanged" ? (
              <span className={`change-badge change-badge--${change}`}>
                {change}
              </span>
            ) : null}
          </div>
          <h1 id="dossier-title">{event.title}</h1>
          <p>{event.locationLabel}</p>
        </section>

        <section
          className="dossier-severity"
          aria-labelledby="severity-heading"
        >
          <span className="dossier-section-label" id="severity-heading">
            Source severity
          </span>
          <strong>{event.nativeSeverity.label}</strong>
          {event.nativeSeverity.description ? (
            <p>{event.nativeSeverity.description}</p>
          ) : null}
          <div className="dossier-priority-line">
            <span
              className={`priority-label priority-label--${event.displayPriority}`}
            >
              {event.displayPriority} priority
            </span>
            <span>{verificationLabel(event.verification)}</span>
          </div>
        </section>

        <section className="dossier-section" aria-labelledby="location-heading">
          <h2 id="location-heading">Location and lifecycle</h2>
          <dl className="dossier-facts dossier-facts--compact">
            <div>
              <dt>Affected countries</dt>
              <dd>{countries}</dd>
            </div>
            <div>
              <dt>Lifecycle</dt>
              <dd>{event.lifecycle}</dd>
            </div>
            <div>
              <dt>Coordinates</dt>
              <dd>
                {event.centroid.latitude.toFixed(3)},{" "}
                {event.centroid.longitude.toFixed(3)}
              </dd>
            </div>
          </dl>
        </section>

        <section
          className="dossier-section"
          aria-labelledby="timestamps-heading"
        >
          <h2 id="timestamps-heading">Timestamps</h2>
          <dl className="dossier-timestamps">
            <TimestampRow label="Occurred" timestamp={event.occurredAt} />
            <TimestampRow label="Started" timestamp={event.startAt} />
            <TimestampRow label="Updated" timestamp={event.updatedAt} />
            <TimestampRow label="Ended" timestamp={event.endedAt} />
          </dl>
        </section>

        {event.facts.length > 0 ? (
          <section className="dossier-section" aria-labelledby="facts-heading">
            <h2 id="facts-heading">Event facts</h2>
            <dl className="dossier-facts">
              {event.facts.map((fact) => (
                <div key={fact.key}>
                  <dt>{fact.label}</dt>
                  <dd>{formatFactValue(fact.value, fact.unit)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {event.summary ? (
          <section
            className="dossier-section"
            aria-labelledby="summary-heading"
          >
            <h2 id="summary-heading">Source summary</h2>
            <p className="dossier-summary">{event.summary}</p>
          </section>
        ) : null}

        <section className="dossier-section" aria-labelledby="geometry-heading">
          <h2 id="geometry-heading">Mapped detail</h2>
          {!event.geometryDetailAvailable ? (
            <p className="geometry-status">
              This source provides a validated centroid for this event; no
              selection-scoped detail layer is advertised.
            </p>
          ) : geometryState === "loading" || geometryState === "idle" ? (
            <p className="geometry-status" role="status">
              Loading validated GDACS paths and affected areas…
            </p>
          ) : geometryState === "ready" ? (
            <p className="geometry-status geometry-status--ready">
              {geometry?.features.length ?? 0} validated geometry feature
              {geometry?.features.length === 1 ? "" : "s"} rendered for this
              selection.
            </p>
          ) : (
            <div
              className="geometry-status geometry-status--error"
              role="alert"
            >
              <p>
                {geometryError ??
                  "Detailed geometry is unavailable for this event. The source centroid and report remain available."}
              </p>
              <button onClick={onRetryGeometry} type="button">
                Retry geometry
              </button>
            </div>
          )}
        </section>

        <section
          className="dossier-section"
          aria-labelledby="sources-heading-dossier"
        >
          <h2 id="sources-heading-dossier">Provenance</h2>
          <div className="dossier-sources">
            {event.sources.map((source) => {
              const health = sourceState(source, sourceHealth);
              return (
                <article key={`${source.source}:${source.sourceEventId}`}>
                  <div>
                    <strong>{source.label}</strong>
                    <span
                      className={`source-state-label source-state-label--${health?.state ?? "idle"}`}
                    >
                      {health?.state === "ok"
                        ? "Available"
                        : health?.state === "error"
                          ? "Unavailable"
                          : "Not requested"}
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>Source ID</dt>
                      <dd>{source.sourceEventId}</dd>
                    </div>
                    <div>
                      <dt>Retrieved</dt>
                      <dd>
                        {formatLocalTimestamp(source.retrievedAt, "full")}
                        <small>{formatUtcTimestamp(source.retrievedAt)}</small>
                      </dd>
                    </div>
                    {source.sourceUpdatedAt ? (
                      <div>
                        <dt>Source updated</dt>
                        <dd>
                          {formatLocalTimestamp(source.sourceUpdatedAt, "full")}
                          <small>
                            {formatUtcTimestamp(source.sourceUpdatedAt)}
                          </small>
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  <a
                    className="source-report-link"
                    href={source.url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Open original report <span aria-hidden="true">↗</span>
                  </a>
                </article>
              );
            })}
          </div>
        </section>

        <section
          className="dossier-section dossier-explanation"
          aria-labelledby="basis-heading"
        >
          <h2 id="basis-heading">Why this priority</h2>
          <p>{event.priorityBasis}</p>
          <p>
            Display priority is a WorldSignal presentation aid; source-native
            severity above remains the authoritative classification.
          </p>
        </section>
      </div>
    </aside>
  );
}
