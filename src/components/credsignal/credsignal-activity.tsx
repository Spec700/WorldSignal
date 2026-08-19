import { LocalTimestamp } from "@/components/local-timestamp";
import type { CredSignalActivityDto } from "@/features/credsignal/types";

import styles from "@/app/credsignal/credsignal.module.css";

export function CredSignalActivity({
  activity,
}: {
  activity: CredSignalActivityDto[];
}) {
  return (
    <section
      className={styles.activityStrip}
      aria-label="CredSignal activity timeline"
    >
      <div className={styles.activityHeading}>
        <span className={styles.eyebrow}>Case activity</span>
        <strong>{activity.length} recent actions</strong>
        <small>Append-only operator history</small>
      </div>
      <ol className={styles.activityTimeline}>
        {activity.length > 0 ? (
          activity.slice(0, 16).map((entry) => (
            <li key={entry.id}>
              <span className={styles.activityMarker} aria-hidden="true" />
              <LocalTimestamp timestamp={entry.occurredAt} />
              <strong>{entry.summary}</strong>
              <small>{entry.actorName ?? "Unattributed operator"}</small>
            </li>
          ))
        ) : (
          <li className={styles.activityEmpty}>
            Activity appears here after the first protectee or exposure is
            recorded.
          </li>
        )}
      </ol>
    </section>
  );
}
