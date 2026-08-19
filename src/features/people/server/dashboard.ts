import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { currentPersonLocation } from "@/features/people/location-model";
import type {
  PeopleDashboardDto,
  PersonIdentityDto,
  PersonLocationDto,
} from "@/features/people/types";
import { getDatabase } from "@/lib/db/client";
import {
  operators,
  protecteeIdentities,
  protecteeLocations,
  protectees,
  workspaces,
} from "@/lib/db/schema";

const emptyDashboard: PeopleDashboardDto = {
  setupRequired: true,
  operators: [],
  people: [],
  metrics: {
    total: 0,
    active: 0,
    located: 0,
    highAttention: 0,
  },
};

export async function getPeopleDashboard(): Promise<PeopleDashboardDto> {
  const database = getDatabase();
  const workspaceSlug = process.env.CREDSIGNAL_WORKSPACE_SLUG ?? "local";
  const [workspace] = await database
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, workspaceSlug))
    .limit(1);

  if (!workspace) {
    return emptyDashboard;
  }

  const [operatorRows, personRows] = await Promise.all([
    database
      .select()
      .from(operators)
      .where(
        and(
          eq(operators.workspaceId, workspace.id),
          eq(operators.status, "active"),
        ),
      )
      .orderBy(asc(operators.displayName)),
    database
      .select()
      .from(protectees)
      .where(eq(protectees.workspaceId, workspace.id))
      .orderBy(asc(protectees.displayName)),
  ]);

  const personIds = personRows.map((person) => person.id);
  const [identityRows, locationRows] = await Promise.all([
    personIds.length > 0
      ? database
          .select()
          .from(protecteeIdentities)
          .where(inArray(protecteeIdentities.protecteeId, personIds))
          .orderBy(desc(protecteeIdentities.isPrimary))
      : [],
    personIds.length > 0
      ? database
          .select()
          .from(protecteeLocations)
          .where(inArray(protecteeLocations.protecteeId, personIds))
          .orderBy(desc(protecteeLocations.effectiveFrom))
      : [],
  ]);

  const people = personRows.map((person) => {
    const identities = identityRows
      .filter((identity) => identity.protecteeId === person.id)
      .map<PersonIdentityDto>((identity) => ({
        id: identity.id,
        type: identity.type,
        displayValue: identity.displayValue,
        isPrimary: identity.isPrimary,
        isActive: identity.isActive,
        verifiedAt: identity.verifiedAt?.toISOString(),
      }));
    const locationHistory = locationRows
      .filter((location) => location.protecteeId === person.id)
      .map<PersonLocationDto>((location) => ({
        id: location.id,
        label: location.label,
        latitude: location.latitude,
        longitude: location.longitude,
        precision: location.precision,
        isActive: location.isActive,
        effectiveFrom: location.effectiveFrom.toISOString(),
        effectiveTo: location.effectiveTo?.toISOString(),
      }));

    return {
      id: person.id,
      displayName: person.displayName,
      title: person.title ?? undefined,
      organization: person.organization ?? undefined,
      tier: person.tier,
      status: person.status,
      notes: person.notes ?? undefined,
      identities,
      location: currentPersonLocation(locationHistory),
      locationHistory,
      createdAt: person.createdAt.toISOString(),
      updatedAt: person.updatedAt.toISOString(),
    };
  });

  const activePeople = people.filter((person) => person.status === "active");

  return {
    setupRequired: false,
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
    },
    operators: operatorRows.map((operator) => ({
      id: operator.id,
      displayName: operator.displayName,
      email: operator.email,
    })),
    people,
    metrics: {
      total: people.length,
      active: activePeople.length,
      located: activePeople.filter((person) => person.location).length,
      highAttention: activePeople.filter(
        (person) => person.tier === "high" || person.tier === "critical",
      ).length,
    },
  };
}
