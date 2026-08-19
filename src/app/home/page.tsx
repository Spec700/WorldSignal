import type { Metadata } from "next";

import { PeopleWorkspace } from "@/components/people/people-workspace";
import { getPeopleDashboard } from "@/features/people/server/dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "People",
  description:
    "The people and approved locations at the center of Priority Signals.",
};

interface HomePageProps {
  searchParams: Promise<{
    person?: string | string[];
    create?: string | string[];
  }>;
}

function singleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const [dashboard, parameters] = await Promise.all([
    getPeopleDashboard(),
    searchParams,
  ]);

  return (
    <PeopleWorkspace
      dashboard={dashboard}
      initialPersonId={singleValue(parameters.person)}
      startCreating={singleValue(parameters.create) === "1"}
    />
  );
}
