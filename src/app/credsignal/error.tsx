"use client";

export default function CredSignalError({ reset }: { reset: () => void }) {
  return (
    <main className="credsignal-route-error">
      <span>CredSignal unavailable</span>
      <h1>The local credential workspace could not be loaded.</h1>
      <p>
        Confirm that PostgreSQL is healthy, migrations are applied, and the
        server environment contains the required database and encryption
        settings.
      </p>
      <button onClick={reset} type="button">
        Retry workspace
      </button>
    </main>
  );
}
