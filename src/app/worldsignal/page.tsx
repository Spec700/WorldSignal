import type { Metadata } from "next";

import { WorldSignalApp } from "@/components/worldsignal-app";
import { getPeopleDashboard } from "@/features/people/server/dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "WorldSignal",
  description:
    "Global natural-hazard situational awareness inside Priority Signals.",
};

export default async function WorldSignalPage() {
  const peopleDashboard = await getPeopleDashboard();
  const people = peopleDashboard.people.map((person) => ({
    id: person.id,
    displayName: person.displayName,
    organization: person.organization,
    tier: person.tier,
    status: person.status,
    location: person.location,
    locationHistory: person.locationHistory,
  }));

  return <WorldSignalApp people={people} />;
}
