"use client";

import { useMemo } from "react";

import { MarkerGlobe } from "@/components/globe/marker-globe";
import {
  personPointTooltip,
  toPersonGlobePoints,
} from "@/components/people/person-globe-model";
import type { PersonDto } from "@/features/people/types";

interface PeopleGlobeProps {
  people: PersonDto[];
  selectedPersonId?: string;
  onSelect: (personId: string) => void;
  onClearSelection: () => void;
}

export function PeopleGlobe({
  people,
  selectedPersonId,
  onSelect,
  onClearSelection,
}: PeopleGlobeProps) {
  const points = useMemo(() => toPersonGlobePoints(people), [people]);

  return (
    <MarkerGlobe
      ariaLabel="Interactive 3D Earth showing current approved locations for priority people."
      emptyLabel="No current person locations to map"
      loadingLabel="Preparing people map…"
      onClearSelection={onClearSelection}
      onSelect={onSelect}
      pointTooltip={personPointTooltip}
      points={points}
      selectedPointId={selectedPersonId}
    />
  );
}
