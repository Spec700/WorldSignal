import type { Metadata } from "next";

import { PeopleGlobeWorkspace } from "@/components/people/people-globe-workspace";
import { getPeopleDashboard } from "@/features/people/server/dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "People Globe",
  description: "Current approved locations for priority people.",
};

interface PeopleGlobePageProps {
  searchParams: Promise<{ person?: string | string[] }>;
}

function singleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PeopleGlobePage({
  searchParams,
}: PeopleGlobePageProps) {
  const [dashboard, parameters] = await Promise.all([
    getPeopleDashboard(),
    searchParams,
  ]);

  return (
    <PeopleGlobeWorkspace
      dashboard={dashboard}
      initialPersonId={singleValue(parameters.person)}
    />
  );
}
