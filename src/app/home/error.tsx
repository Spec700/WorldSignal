"use client";

import styles from "./home.module.css";

export default function HomeError({ reset }: { reset: () => void }) {
  return (
    <main className={styles.routeState}>
      <span>People unavailable</span>
      <h1>The priority roster could not be loaded.</h1>
      <p>
        Confirm that PostgreSQL is healthy, migrations are applied, and the
        local synthetic workspace has been seeded.
      </p>
      <button onClick={reset} type="button">
        Retry roster
      </button>
    </main>
  );
}
