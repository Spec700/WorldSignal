import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  addPersonIdentityInputSchema,
  createPersonInputSchema,
  normalizeIdentity,
  replacePersonLocationInputSchema,
  updatePersonInputSchema,
  type AddPersonIdentityInput,
  type CreatePersonInput,
  type ReplacePersonLocationInput,
  type UpdatePersonInput,
} from "@/features/people/domain";
import { getDatabase } from "@/lib/db/client";
import {
  activityLog,
  operators,
  protecteeIdentities,
  protecteeLocations,
  protectees,
  responseCases,
  workspaces,
} from "@/lib/db/schema";

export class PeopleWorkflowError extends Error {}
export class PeopleConflictError extends PeopleWorkflowError {}
export class PeopleNotFoundError extends PeopleWorkflowError {}

type PeopleDatabase = ReturnType<typeof getDatabase>;

const workspaceSlug = () => process.env.CREDSIGNAL_WORKSPACE_SLUG ?? "local";

async function getLocalWorkspace() {
  const database = getDatabase();
  const [workspace] = await database
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, workspaceSlug()))
    .limit(1);

  if (!workspace) {
    throw new PeopleNotFoundError(
      "Priority Signals has not been initialized. Run the database seed command first.",
    );
  }

  return { database, workspace };
}

async function resolveActor(workspaceId: string, requestedOperatorId?: string) {
  if (!requestedOperatorId) {
    return undefined;
  }

  const database = getDatabase();
  const [operator] = await database
    .select()
    .from(operators)
    .where(
      and(
        eq(operators.id, requestedOperatorId),
        eq(operators.workspaceId, workspaceId),
        eq(operators.status, "active"),
      ),
    )
    .limit(1);

  if (!operator) {
    throw new PeopleNotFoundError(
      "The selected operator is not active in this workspace.",
    );
  }

  return operator;
}

async function requirePerson(
  database: PeopleDatabase,
  workspaceId: string,
  personId: string,
) {
  const parsedPersonId = z.string().uuid().parse(personId);
  const [person] = await database
    .select()
    .from(protectees)
    .where(
      and(
        eq(protectees.id, parsedPersonId),
        eq(protectees.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!person) {
    throw new PeopleNotFoundError(
      "The selected person no longer exists in this workspace.",
    );
  }

  return person;
}

export async function createPerson(
  rawInput: CreatePersonInput,
  actorOperatorId?: string,
) {
  const input = createPersonInputSchema.parse(rawInput);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const normalizedIdentity = normalizeIdentity(
    input.identityType,
    input.identityValue,
  );
  const [existingIdentity] = await database
    .select({
      id: protecteeIdentities.id,
      protecteeId: protecteeIdentities.protecteeId,
    })
    .from(protecteeIdentities)
    .where(
      and(
        eq(protecteeIdentities.workspaceId, workspace.id),
        eq(protecteeIdentities.type, input.identityType),
        eq(protecteeIdentities.normalizedValue, normalizedIdentity),
      ),
    )
    .limit(1);

  if (existingIdentity) {
    throw new PeopleConflictError(
      "That identity is already assigned to a person in this workspace.",
    );
  }

  return database.transaction(async (transaction) => {
    const [person] = await transaction
      .insert(protectees)
      .values({
        workspaceId: workspace.id,
        displayName: input.displayName,
        title: input.title || null,
        organization: input.organization || null,
        tier: input.tier,
        notes: input.notes || null,
      })
      .returning();
    const [identity] = await transaction
      .insert(protecteeIdentities)
      .values({
        workspaceId: workspace.id,
        protecteeId: person.id,
        type: input.identityType,
        displayValue: input.identityValue,
        normalizedValue: normalizedIdentity,
        isPrimary: true,
        verifiedAt: new Date(),
      })
      .returning();
    const [location] = await transaction
      .insert(protecteeLocations)
      .values({
        protecteeId: person.id,
        label: input.locationLabel,
        latitude: input.latitude,
        longitude: input.longitude,
        precision: input.precision,
      })
      .returning();

    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: "person.created",
      entityType: "person",
      entityId: person.id,
      summary: `${person.displayName} was added to the priority roster.`,
      metadata: {
        identityType: identity.type,
        locationPrecision: location.precision,
        tier: person.tier,
      },
    });

    return { personId: person.id };
  });
}

export async function updatePerson(
  rawInput: UpdatePersonInput,
  actorOperatorId?: string,
) {
  const input = updatePersonInputSchema.parse(rawInput);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const person = await requirePerson(database, workspace.id, input.personId);

  if (input.status === "archived") {
    const activeCases = await database
      .select({ status: responseCases.status })
      .from(responseCases)
      .where(eq(responseCases.protecteeId, person.id));
    if (
      activeCases.some(
        (responseCase) =>
          responseCase.status !== "closed" &&
          responseCase.status !== "dismissed",
      )
    ) {
      throw new PeopleWorkflowError(
        "Close or dismiss every active response case before archiving this person.",
      );
    }
  }

  return database.transaction(async (transaction) => {
    const [updatedPerson] = await transaction
      .update(protectees)
      .set({
        displayName: input.displayName,
        title: input.title || null,
        organization: input.organization || null,
        tier: input.tier,
        status: input.status,
        notes: input.notes || null,
        updatedAt: new Date(),
      })
      .where(eq(protectees.id, person.id))
      .returning();

    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: "person.updated",
      entityType: "person",
      entityId: person.id,
      summary: `${updatedPerson.displayName} roster profile was updated.`,
      metadata: {
        previousStatus: person.status,
        status: updatedPerson.status,
        tier: updatedPerson.tier,
      },
    });

    return { personId: updatedPerson.id };
  });
}

export async function addPersonIdentity(
  rawInput: AddPersonIdentityInput,
  actorOperatorId?: string,
) {
  const input = addPersonIdentityInputSchema.parse(rawInput);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const person = await requirePerson(database, workspace.id, input.personId);
  const normalizedValue = normalizeIdentity(input.type, input.value);
  const [existingIdentity] = await database
    .select()
    .from(protecteeIdentities)
    .where(
      and(
        eq(protecteeIdentities.workspaceId, workspace.id),
        eq(protecteeIdentities.type, input.type),
        eq(protecteeIdentities.normalizedValue, normalizedValue),
      ),
    )
    .limit(1);

  if (existingIdentity?.protecteeId !== undefined) {
    if (existingIdentity.protecteeId !== person.id) {
      throw new PeopleConflictError(
        "That identity already belongs to another person in this workspace.",
      );
    }
    if (existingIdentity.isActive) {
      throw new PeopleConflictError(
        "That identity is already active for this person.",
      );
    }
  }

  const [currentPrimary] = await database
    .select({ id: protecteeIdentities.id })
    .from(protecteeIdentities)
    .where(
      and(
        eq(protecteeIdentities.protecteeId, person.id),
        eq(protecteeIdentities.isActive, true),
        eq(protecteeIdentities.isPrimary, true),
      ),
    )
    .limit(1);
  const makePrimary = input.makePrimary || !currentPrimary;
  const now = new Date();

  return database.transaction(async (transaction) => {
    if (makePrimary) {
      await transaction
        .update(protecteeIdentities)
        .set({ isPrimary: false, updatedAt: now })
        .where(eq(protecteeIdentities.protecteeId, person.id));
    }

    const [identity] = existingIdentity
      ? await transaction
          .update(protecteeIdentities)
          .set({
            displayValue: input.value,
            isActive: true,
            isPrimary: makePrimary,
            verifiedAt: now,
            updatedAt: now,
          })
          .where(eq(protecteeIdentities.id, existingIdentity.id))
          .returning()
      : await transaction
          .insert(protecteeIdentities)
          .values({
            workspaceId: workspace.id,
            protecteeId: person.id,
            type: input.type,
            displayValue: input.value,
            normalizedValue,
            isActive: true,
            isPrimary: makePrimary,
            verifiedAt: now,
          })
          .returning();

    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: existingIdentity
        ? "person.identity_reactivated"
        : "person.identity_added",
      entityType: "person_identity",
      entityId: identity.id,
      summary: `${input.type.replaceAll("_", " ")} identity ${existingIdentity ? "reactivated" : "added"} for ${person.displayName}.`,
      metadata: { makePrimary, personId: person.id },
    });

    return { identityId: identity.id, personId: person.id };
  });
}

export async function setPrimaryPersonIdentity(
  identityId: string,
  actorOperatorId?: string,
) {
  const parsedIdentityId = z.string().uuid().parse(identityId);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const [identity] = await database
    .select({
      id: protecteeIdentities.id,
      protecteeId: protecteeIdentities.protecteeId,
    })
    .from(protecteeIdentities)
    .where(
      and(
        eq(protecteeIdentities.id, parsedIdentityId),
        eq(protecteeIdentities.workspaceId, workspace.id),
        eq(protecteeIdentities.isActive, true),
      ),
    )
    .limit(1);

  if (!identity) {
    throw new PeopleNotFoundError(
      "The selected identity is not active in this workspace.",
    );
  }
  const person = await requirePerson(
    database,
    workspace.id,
    identity.protecteeId,
  );
  const now = new Date();

  await database.transaction(async (transaction) => {
    await transaction
      .update(protecteeIdentities)
      .set({ isPrimary: false, updatedAt: now })
      .where(eq(protecteeIdentities.protecteeId, identity.protecteeId));
    await transaction
      .update(protecteeIdentities)
      .set({ isPrimary: true, updatedAt: now })
      .where(eq(protecteeIdentities.id, identity.id));
    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: "person.primary_identity_changed",
      entityType: "person_identity",
      entityId: identity.id,
      summary: `Primary identity changed for ${person.displayName}.`,
      metadata: { personId: person.id },
    });
  });

  return { identityId: identity.id, personId: person.id };
}

export async function deactivatePersonIdentity(
  identityId: string,
  actorOperatorId?: string,
) {
  const parsedIdentityId = z.string().uuid().parse(identityId);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const [identity] = await database
    .select()
    .from(protecteeIdentities)
    .where(
      and(
        eq(protecteeIdentities.id, parsedIdentityId),
        eq(protecteeIdentities.workspaceId, workspace.id),
      ),
    )
    .limit(1);

  if (!identity || !identity.isActive) {
    throw new PeopleNotFoundError(
      "The selected identity is not active in this workspace.",
    );
  }
  if (identity.isPrimary) {
    throw new PeopleWorkflowError(
      "Choose a different primary identity before deactivating this one.",
    );
  }
  const person = await requirePerson(
    database,
    workspace.id,
    identity.protecteeId,
  );
  const activeIdentities = await database
    .select({ id: protecteeIdentities.id })
    .from(protecteeIdentities)
    .where(
      and(
        eq(protecteeIdentities.protecteeId, person.id),
        eq(protecteeIdentities.isActive, true),
      ),
    );
  if (activeIdentities.length <= 1) {
    throw new PeopleWorkflowError(
      "A monitored person must retain at least one active identity.",
    );
  }

  await database.transaction(async (transaction) => {
    await transaction
      .update(protecteeIdentities)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(protecteeIdentities.id, identity.id));
    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: "person.identity_deactivated",
      entityType: "person_identity",
      entityId: identity.id,
      summary: `Identity deactivated for ${person.displayName}.`,
      metadata: { personId: person.id },
    });
  });

  return { identityId: identity.id, personId: person.id };
}

export async function replacePersonLocation(
  rawInput: ReplacePersonLocationInput,
  actorOperatorId?: string,
) {
  const input = replacePersonLocationInputSchema.parse(rawInput);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const person = await requirePerson(database, workspace.id, input.personId);
  const now = new Date();

  return database.transaction(async (transaction) => {
    await transaction
      .update(protecteeLocations)
      .set({ isActive: false, effectiveTo: now, updatedAt: now })
      .where(
        and(
          eq(protecteeLocations.protecteeId, person.id),
          eq(protecteeLocations.isActive, true),
        ),
      );
    const [location] = await transaction
      .insert(protecteeLocations)
      .values({
        protecteeId: person.id,
        label: input.label,
        latitude: input.latitude,
        longitude: input.longitude,
        precision: input.precision,
        effectiveFrom: now,
      })
      .returning();
    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: "person.location_changed",
      entityType: "person_location",
      entityId: location.id,
      summary: `Operational location changed for ${person.displayName}.`,
      metadata: {
        label: location.label,
        precision: location.precision,
        personId: person.id,
      },
    });

    return { locationId: location.id, personId: person.id };
  });
}
