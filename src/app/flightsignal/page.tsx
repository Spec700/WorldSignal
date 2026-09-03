import type { Metadata } from "next";

import { FlightSignalWorkspace } from "@/components/flightsignal/flight-signal-workspace";
import { getFlightSignalDashboard } from "@/features/flights/server/dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "FlightSignal",
  description:
    "Assigned flight awareness with operator-confirmed traveler context and AirLabs aircraft observations.",
};

interface FlightSignalPageProps {
  searchParams: Promise<{ flight?: string | string[] }>;
}

export default async function FlightSignalPage({
  searchParams,
}: FlightSignalPageProps) {
  const [dashboard, parameters] = await Promise.all([
    getFlightSignalDashboard(),
    searchParams,
  ]);
  const requestedFlight = Array.isArray(parameters.flight)
    ? parameters.flight[0]
    : parameters.flight;

  return (
    <FlightSignalWorkspace
      dashboard={dashboard}
      initialFlightId={requestedFlight}
    />
  );
}
