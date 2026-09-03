"use client";

export default function FlightSignalError({ reset }: { reset: () => void }) {
  return (
    <main className="globe-module-loading" role="alert">
      <p>FlightSignal could not load its local workspace.</p>
      <button onClick={reset} type="button">
        Try again
      </button>
    </main>
  );
}
