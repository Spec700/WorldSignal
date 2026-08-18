import type { Metadata } from "next";

import { CredSignalWorkspace } from "@/components/credsignal/credsignal-workspace";
import { getCredSignalDashboard } from "@/features/credsignal/server/dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CredSignal",
  description:
    "Credential exposure intelligence and protectee response coordination inside Priority Signals.",
};

export default async function CredSignalPage() {
  const dashboard = await getCredSignalDashboard();

  return <CredSignalWorkspace dashboard={dashboard} />;
}
