import type { Metadata } from "next";

import { CredSignalWorkspace } from "@/components/credsignal/credsignal-workspace";
import { getCredSignalDashboard } from "@/features/credsignal/server/dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CredSignal Globe",
  description:
    "Global managed credential posture and response coordination for Priority Signals people.",
};

export default async function CredSignalGlobePage() {
  const dashboard = await getCredSignalDashboard();

  return <CredSignalWorkspace dashboard={dashboard} />;
}
