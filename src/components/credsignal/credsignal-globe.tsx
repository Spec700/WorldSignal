"use client";

import { useMemo } from "react";

import {
  credSignalPointTooltip,
  toCredSignalGlobePoints,
} from "@/components/credsignal/credsignal-globe-model";
import { MarkerGlobe } from "@/components/globe/marker-globe";
import type { CredSignalProtecteeDto } from "@/features/credsignal/types";

interface CredSignalGlobeProps {
  protectees: CredSignalProtecteeDto[];
  selectedProtectee?: CredSignalProtecteeDto;
  onSelect: (protecteeId: string) => void;
  onClearSelection: () => void;
}

export function CredSignalGlobe({
  protectees,
  selectedProtectee,
  onSelect,
  onClearSelection,
}: CredSignalGlobeProps) {
  const points = useMemo(
    () => toCredSignalGlobePoints(protectees),
    [protectees],
  );

  return (
    <MarkerGlobe
      ariaLabel="Interactive 3D Earth showing people and their managed credential posture."
      emptyLabel="No people locations to map"
      loadingLabel="Preparing credential posture map…"
      onClearSelection={onClearSelection}
      onSelect={onSelect}
      pointTooltip={credSignalPointTooltip}
      points={points}
      selectedPointId={selectedProtectee?.id}
    />
  );
}
