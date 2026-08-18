import type { Metadata } from "next";

import { WorldSignalApp } from "@/components/worldsignal-app";

export const metadata: Metadata = {
  title: "WorldSignal",
  description:
    "Global natural-hazard situational awareness inside Priority Signals.",
};

export default function WorldSignalPage() {
  return <WorldSignalApp />;
}
