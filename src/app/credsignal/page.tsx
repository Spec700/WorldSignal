import type { Metadata } from "next";

import { CredSignalInventoryWorkspace } from "@/components/credsignal/credsignal-inventory-workspace";
import { getCredSignalDashboard } from "@/features/credsignal/server/dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CredSignal",
  description:
    "Managed credential inventory, exposure intelligence, and response coordination inside Priority Signals.",
};

export default async function CredSignalPage() {
  const dashboard = await getCredSignalDashboard();

  return <CredSignalInventoryWorkspace dashboard={dashboard} />;
}
