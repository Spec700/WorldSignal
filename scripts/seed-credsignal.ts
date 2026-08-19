import { eq } from "drizzle-orm";

import {
  buildExposureDedupeKey,
  normalizeIdentity,
} from "../src/features/credsignal/domain";
import { getCredentialCryptoConfig } from "../src/lib/credentials/config";
import {
  encryptSecret,
  fingerprintSecret,
} from "../src/lib/credentials/secret-crypto";
import { closeDatabase, getDatabase } from "../src/lib/db/client";
import {
  activityLog,
  caseExposures,
  caseTasks,
  communications,
  credentialExposures,
  exposureMatches,
  exposureSources,
  operatorRoles,
  operators,
  protecteeIdentities,
  protecteeLocations,
  protectees,
  responseCases,
  roles,
  workspaces,
} from "../src/lib/db/schema";

const ids = {
  workspace: "00000000-0000-4000-8000-000000000001",
  roles: {
    admin: "10000000-0000-4000-8000-000000000001",
    lead: "10000000-0000-4000-8000-000000000002",
    analyst: "10000000-0000-4000-8000-000000000003",
    viewer: "10000000-0000-4000-8000-000000000004",
  },
  operators: {
    lena: "20000000-0000-4000-8000-000000000001",
    omar: "20000000-0000-4000-8000-000000000002",
    priya: "20000000-0000-4000-8000-000000000003",
  },
  protectees: {
    avery: "30000000-0000-4000-8000-000000000001",
    maya: "30000000-0000-4000-8000-000000000002",
    elias: "30000000-0000-4000-8000-000000000003",
    sofia: "30000000-0000-4000-8000-000000000004",
    noah: "30000000-0000-4000-8000-000000000005",
    amara: "30000000-0000-4000-8000-000000000006",
    kenji: "30000000-0000-4000-8000-000000000007",
    lucia: "30000000-0000-4000-8000-000000000008",
    henrik: "30000000-0000-4000-8000-000000000009",
    nadia: "30000000-0000-4000-8000-000000000010",
    marcus: "30000000-0000-4000-8000-000000000011",
    camille: "30000000-0000-4000-8000-000000000012",
    thiago: "30000000-0000-4000-8000-000000000013",
    samira: "30000000-0000-4000-8000-000000000014",
    jonah: "30000000-0000-4000-8000-000000000015",
  },
  identities: {
    avery: "40000000-0000-4000-8000-000000000001",
    maya: "40000000-0000-4000-8000-000000000002",
    elias: "40000000-0000-4000-8000-000000000003",
    sofia: "40000000-0000-4000-8000-000000000004",
    noah: "40000000-0000-4000-8000-000000000005",
    amara: "40000000-0000-4000-8000-000000000006",
    kenji: "40000000-0000-4000-8000-000000000007",
    lucia: "40000000-0000-4000-8000-000000000008",
    henrik: "40000000-0000-4000-8000-000000000009",
    nadia: "40000000-0000-4000-8000-000000000010",
    marcus: "40000000-0000-4000-8000-000000000011",
    camille: "40000000-0000-4000-8000-000000000012",
    thiago: "40000000-0000-4000-8000-000000000013",
    samira: "40000000-0000-4000-8000-000000000014",
    jonah: "40000000-0000-4000-8000-000000000015",
  },
  locations: {
    avery: "50000000-0000-4000-8000-000000000001",
    maya: "50000000-0000-4000-8000-000000000002",
    elias: "50000000-0000-4000-8000-000000000003",
    sofia: "50000000-0000-4000-8000-000000000004",
    noah: "50000000-0000-4000-8000-000000000005",
    amara: "50000000-0000-4000-8000-000000000006",
    kenji: "50000000-0000-4000-8000-000000000007",
    lucia: "50000000-0000-4000-8000-000000000008",
    henrik: "50000000-0000-4000-8000-000000000009",
    nadia: "50000000-0000-4000-8000-000000000010",
    marcus: "50000000-0000-4000-8000-000000000011",
    camille: "50000000-0000-4000-8000-000000000012",
    thiago: "50000000-0000-4000-8000-000000000013",
    samira: "50000000-0000-4000-8000-000000000014",
    jonah: "50000000-0000-4000-8000-000000000015",
  },
  sources: {
    stealer: "60000000-0000-4000-8000-000000000001",
    breach: "60000000-0000-4000-8000-000000000002",
    phishing: "60000000-0000-4000-8000-000000000003",
  },
  exposures: {
    avery: "70000000-0000-4000-8000-000000000001",
    maya: "70000000-0000-4000-8000-000000000002",
    elias: "70000000-0000-4000-8000-000000000003",
  },
  matches: {
    avery: "80000000-0000-4000-8000-000000000001",
    maya: "80000000-0000-4000-8000-000000000002",
    elias: "80000000-0000-4000-8000-000000000003",
  },
  cases: {
    avery: "90000000-0000-4000-8000-000000000001",
    maya: "90000000-0000-4000-8000-000000000002",
    elias: "90000000-0000-4000-8000-000000000003",
  },
  tasks: {
    averyRevoke: "a0000000-0000-4000-8000-000000000001",
    averyReset: "a0000000-0000-4000-8000-000000000002",
    mayaReset: "a0000000-0000-4000-8000-000000000003",
    eliasVerify: "a0000000-0000-4000-8000-000000000004",
  },
  communication: "b0000000-0000-4000-8000-000000000001",
  activity: {
    averyExposure: "c0000000-0000-4000-8000-000000000001",
    averyCase: "c0000000-0000-4000-8000-000000000002",
    mayaExposure: "c0000000-0000-4000-8000-000000000003",
  },
} as const;

const observedAt = {
  stealer: new Date("2026-08-18T13:45:00.000Z"),
  breach: new Date("2026-08-16T09:20:00.000Z"),
  phishing: new Date("2026-08-17T20:10:00.000Z"),
};

const additionalPeople = [
  {
    id: ids.protectees.sofia,
    identityId: ids.identities.sofia,
    locationId: ids.locations.sofia,
    displayName: "Sofia Patel",
    title: "Chief Product Officer",
    organization: "HelioGrid Systems",
    tier: "high",
    email: "sofia.patel@heliogrid.example",
    location: "Mumbai, India",
    latitude: 19.076,
    longitude: 72.8777,
    verifiedAt: "2026-08-04T12:00:00.000Z",
    notes:
      "Synthetic demo profile. Oversees a distributed product organization across South Asia.",
  },
  {
    id: ids.protectees.noah,
    identityId: ids.identities.noah,
    locationId: ids.locations.noah,
    displayName: "Noah Williams",
    title: "Managing Director",
    organization: "Pacific Arc Ventures",
    tier: "standard",
    email: "noah.williams@pacificarc.example",
    location: "Sydney, Australia",
    latitude: -33.8688,
    longitude: 151.2093,
    verifiedAt: "2026-08-05T12:00:00.000Z",
    notes:
      "Synthetic demo profile. Regularly travels between Australia and Southeast Asia.",
  },
  {
    id: ids.protectees.amara,
    identityId: ids.identities.amara,
    locationId: ids.locations.amara,
    displayName: "Amara Okafor",
    title: "Regional President",
    organization: "Kestrel Health",
    tier: "high",
    email: "amara.okafor@kestrelhealth.example",
    location: "Lagos, Nigeria",
    latitude: 6.5244,
    longitude: 3.3792,
    verifiedAt: "2026-08-06T12:00:00.000Z",
    notes:
      "Synthetic demo profile. Coordinates regional health programs across West Africa.",
  },
  {
    id: ids.protectees.kenji,
    identityId: ids.identities.kenji,
    locationId: ids.locations.kenji,
    displayName: "Kenji Sato",
    title: "Robotics Program Director",
    organization: "Aster Robotics",
    tier: "standard",
    email: "kenji.sato@asterrobotics.example",
    location: "Tokyo, Japan",
    latitude: 35.6762,
    longitude: 139.6503,
    verifiedAt: "2026-08-07T12:00:00.000Z",
    notes:
      "Synthetic demo profile. Leads robotics partnerships and public demonstrations.",
  },
  {
    id: ids.protectees.lucia,
    identityId: ids.identities.lucia,
    locationId: ids.locations.lucia,
    displayName: "Lucía Torres",
    title: "General Counsel",
    organization: "Cloud Harbor",
    tier: "high",
    email: "lucia.torres@cloudharbor.example",
    location: "Mexico City, Mexico",
    latitude: 19.4326,
    longitude: -99.1332,
    verifiedAt: "2026-08-08T12:00:00.000Z",
    notes:
      "Synthetic demo profile. Supports cross-border legal and regulatory matters.",
  },
  {
    id: ids.protectees.henrik,
    identityId: ids.identities.henrik,
    locationId: ids.locations.henrik,
    displayName: "Henrik Larsen",
    title: "Chief Sustainability Officer",
    organization: "Northline Energy",
    tier: "standard",
    email: "henrik.larsen@northline.example",
    location: "Copenhagen, Denmark",
    latitude: 55.6761,
    longitude: 12.5683,
    verifiedAt: "2026-08-09T12:00:00.000Z",
    notes:
      "Synthetic demo profile. Represents energy-transition initiatives across Europe.",
  },
  {
    id: ids.protectees.nadia,
    identityId: ids.identities.nadia,
    locationId: ids.locations.nadia,
    displayName: "Nadia El-Sayed",
    title: "Executive Chair",
    organization: "Atlas Civic Group",
    tier: "critical",
    email: "nadia.elsayed@atlascivic.example",
    location: "Cairo, Egypt",
    latitude: 30.0444,
    longitude: 31.2357,
    verifiedAt: "2026-08-10T12:00:00.000Z",
    notes:
      "Synthetic demo profile. Chairs civic infrastructure programs across North Africa.",
  },
  {
    id: ids.protectees.marcus,
    identityId: ids.identities.marcus,
    locationId: ids.locations.marcus,
    displayName: "Marcus Reed",
    title: "Government Affairs Director",
    organization: "Emberline Logistics",
    tier: "standard",
    email: "marcus.reed@emberline.example",
    location: "Washington, DC",
    latitude: 38.9072,
    longitude: -77.0369,
    verifiedAt: "2026-08-11T12:00:00.000Z",
    notes:
      "Synthetic demo profile. Coordinates public-sector partnerships in the United States.",
  },
  {
    id: ids.protectees.camille,
    identityId: ids.identities.camille,
    locationId: ids.locations.camille,
    displayName: "Camille Dubois",
    title: "Research Director",
    organization: "Lumen Biotech",
    tier: "standard",
    email: "camille.dubois@lumenbiotech.example",
    location: "Paris, France",
    latitude: 48.8566,
    longitude: 2.3522,
    verifiedAt: "2026-08-12T12:00:00.000Z",
    notes:
      "Synthetic demo profile. Leads international clinical research collaborations.",
  },
  {
    id: ids.protectees.thiago,
    identityId: ids.identities.thiago,
    locationId: ids.locations.thiago,
    displayName: "Thiago Costa",
    title: "Chief Operating Officer",
    organization: "Oriole Finance",
    tier: "high",
    email: "thiago.costa@oriolefinance.example",
    location: "São Paulo, Brazil",
    latitude: -23.5505,
    longitude: -46.6333,
    verifiedAt: "2026-08-13T12:00:00.000Z",
    notes:
      "Synthetic demo profile. Oversees financial operations across Latin America.",
  },
  {
    id: ids.protectees.samira,
    identityId: ids.identities.samira,
    locationId: ids.locations.samira,
    displayName: "Samira Rahman",
    title: "Founder and CEO",
    organization: "Vela Infrastructure",
    tier: "critical",
    email: "samira.rahman@velainfra.example",
    location: "Dubai, United Arab Emirates",
    latitude: 25.2048,
    longitude: 55.2708,
    verifiedAt: "2026-08-14T12:00:00.000Z",
    notes:
      "Synthetic demo profile. Leads critical infrastructure projects across the Gulf.",
  },
  {
    id: ids.protectees.jonah,
    identityId: ids.identities.jonah,
    locationId: ids.locations.jonah,
    displayName: "Jonah Weber",
    title: "Security Engineering Director",
    organization: "FerroWorks",
    tier: "standard",
    email: "jonah.weber@ferroworks.example",
    location: "Berlin, Germany",
    latitude: 52.52,
    longitude: 13.405,
    verifiedAt: "2026-08-15T12:00:00.000Z",
    notes:
      "Synthetic demo profile. Directs security engineering for European manufacturing sites.",
  },
] as const;

async function seed() {
  const database = getDatabase();
  const cryptoConfig = getCredentialCryptoConfig();
  const workspaceSlug = process.env.CREDSIGNAL_WORKSPACE_SLUG ?? "local";

  const [workspace] = await database
    .insert(workspaces)
    .values({
      id: ids.workspace,
      name: "Priority Signals Local Team",
      slug: workspaceSlug,
    })
    .onConflictDoUpdate({
      target: workspaces.slug,
      set: { name: "Priority Signals Local Team", updatedAt: new Date() },
    })
    .returning();

  await database.transaction(async (transaction) => {
    await transaction
      .insert(roles)
      .values([
        {
          id: ids.roles.admin,
          workspaceId: workspace.id,
          slug: "admin",
          name: "Administrator",
          description: "Workspace and operator administration.",
        },
        {
          id: ids.roles.lead,
          workspaceId: workspace.id,
          slug: "lead",
          name: "Security Lead",
          description: "Case oversight, assignment, and closure.",
        },
        {
          id: ids.roles.analyst,
          workspaceId: workspace.id,
          slug: "analyst",
          name: "Analyst",
          description: "Exposure triage and remediation coordination.",
        },
        {
          id: ids.roles.viewer,
          workspaceId: workspace.id,
          slug: "viewer",
          name: "Viewer",
          description: "Read-only operational awareness when auth is added.",
        },
      ])
      .onConflictDoNothing();

    await transaction
      .insert(operators)
      .values([
        {
          id: ids.operators.lena,
          workspaceId: workspace.id,
          displayName: "Lena Park",
          email: "lena.park@priority-signals.example",
        },
        {
          id: ids.operators.omar,
          workspaceId: workspace.id,
          displayName: "Omar Haddad",
          email: "omar.haddad@priority-signals.example",
        },
        {
          id: ids.operators.priya,
          workspaceId: workspace.id,
          displayName: "Priya Shah",
          email: "priya.shah@priority-signals.example",
        },
      ])
      .onConflictDoNothing();

    await transaction
      .insert(operatorRoles)
      .values([
        { operatorId: ids.operators.lena, roleId: ids.roles.lead },
        { operatorId: ids.operators.omar, roleId: ids.roles.analyst },
        { operatorId: ids.operators.priya, roleId: ids.roles.analyst },
      ])
      .onConflictDoNothing();

    await transaction
      .insert(protectees)
      .values([
        {
          id: ids.protectees.avery,
          workspaceId: workspace.id,
          displayName: "Avery Chen",
          title: "Chief Executive Officer",
          organization: "Northstar Labs",
          tier: "critical",
        },
        {
          id: ids.protectees.maya,
          workspaceId: workspace.id,
          displayName: "Maya Rodriguez",
          title: "Executive Vice President",
          organization: "Meridian Research",
          tier: "high",
        },
        {
          id: ids.protectees.elias,
          workspaceId: workspace.id,
          displayName: "Elias Morgan",
          title: "Board Member",
          organization: "Redstone Foundation",
          tier: "standard",
        },
        ...additionalPeople.map((person) => ({
          id: person.id,
          workspaceId: workspace.id,
          displayName: person.displayName,
          title: person.title,
          organization: person.organization,
          tier: person.tier,
          notes: person.notes,
        })),
      ])
      .onConflictDoNothing();

    await transaction
      .insert(protecteeIdentities)
      .values([
        {
          id: ids.identities.avery,
          workspaceId: workspace.id,
          protecteeId: ids.protectees.avery,
          type: "work_email",
          displayValue: "avery.chen@northstar.example",
          normalizedValue: "avery.chen@northstar.example",
          isPrimary: true,
          verifiedAt: new Date("2026-08-01T12:00:00.000Z"),
        },
        {
          id: ids.identities.maya,
          workspaceId: workspace.id,
          protecteeId: ids.protectees.maya,
          type: "work_email",
          displayValue: "maya.rodriguez@meridian.example",
          normalizedValue: "maya.rodriguez@meridian.example",
          isPrimary: true,
          verifiedAt: new Date("2026-08-02T12:00:00.000Z"),
        },
        {
          id: ids.identities.elias,
          workspaceId: workspace.id,
          protecteeId: ids.protectees.elias,
          type: "personal_email",
          displayValue: "elias.morgan@example.test",
          normalizedValue: "elias.morgan@example.test",
          isPrimary: true,
          verifiedAt: new Date("2026-08-03T12:00:00.000Z"),
        },
        ...additionalPeople.map((person) => ({
          id: person.identityId,
          workspaceId: workspace.id,
          protecteeId: person.id,
          type: "work_email" as const,
          displayValue: person.email,
          normalizedValue: person.email,
          isPrimary: true,
          verifiedAt: new Date(person.verifiedAt),
        })),
      ])
      .onConflictDoNothing();

    await transaction
      .insert(protecteeLocations)
      .values([
        {
          id: ids.locations.avery,
          protecteeId: ids.protectees.avery,
          label: "New York, NY",
          latitude: 40.7128,
          longitude: -74.006,
          precision: "city",
          effectiveFrom: new Date("2026-08-01T12:00:00.000Z"),
        },
        {
          id: ids.locations.maya,
          protecteeId: ids.protectees.maya,
          label: "London, United Kingdom",
          latitude: 51.5072,
          longitude: -0.1276,
          precision: "city",
          effectiveFrom: new Date("2026-08-02T12:00:00.000Z"),
        },
        {
          id: ids.locations.elias,
          protecteeId: ids.protectees.elias,
          label: "Singapore",
          latitude: 1.3521,
          longitude: 103.8198,
          precision: "city",
          effectiveFrom: new Date("2026-08-03T12:00:00.000Z"),
        },
        ...additionalPeople.map((person) => ({
          id: person.locationId,
          protecteeId: person.id,
          label: person.location,
          latitude: person.latitude,
          longitude: person.longitude,
          precision: "city" as const,
          effectiveFrom: new Date(person.verifiedAt),
        })),
      ])
      .onConflictDoNothing();

    await transaction
      .insert(exposureSources)
      .values([
        {
          id: ids.sources.stealer,
          workspaceId: workspace.id,
          type: "infostealer",
          name: "Synthetic RedLine collection",
          sourceRecordId: "DEMO-STEALER-001",
          observedAt: observedAt.stealer,
          confidence: "confirmed",
          notes:
            "Synthetic demonstration source. No real person or breach data.",
          createdByOperatorId: ids.operators.omar,
        },
        {
          id: ids.sources.breach,
          workspaceId: workspace.id,
          type: "breach",
          name: "Synthetic vendor portal breach",
          sourceRecordId: "DEMO-BREACH-014",
          observedAt: observedAt.breach,
          confidence: "high",
          notes:
            "Synthetic demonstration source. No real person or breach data.",
          createdByOperatorId: ids.operators.priya,
        },
        {
          id: ids.sources.phishing,
          workspaceId: workspace.id,
          type: "phishing",
          name: "Synthetic credential phishing report",
          sourceRecordId: "DEMO-PHISH-008",
          observedAt: observedAt.phishing,
          confidence: "medium",
          notes:
            "Synthetic demonstration source. No real person or breach data.",
          createdByOperatorId: ids.operators.omar,
        },
      ])
      .onConflictDoNothing();

    const exposureFixtures = [
      {
        id: ids.exposures.avery,
        sourceId: ids.sources.stealer,
        identityType: "work_email" as const,
        identityValue: "avery.chen@northstar.example",
        credentialKind: "session_cookie" as const,
        secret: "DEMO-ONLY-SESSION-COOKIE-AVERY",
        service: "Northstar Identity",
        serviceDomain: "id.northstar.example",
        sourceType: "infostealer" as const,
        sourceName: "Synthetic RedLine collection",
        sourceRecordId: "DEMO-STEALER-001",
        observedAt: observedAt.stealer,
        severity: "critical" as const,
        confidence: "confirmed" as const,
        operatorId: ids.operators.omar,
      },
      {
        id: ids.exposures.maya,
        sourceId: ids.sources.breach,
        identityType: "work_email" as const,
        identityValue: "maya.rodriguez@meridian.example",
        credentialKind: "password" as const,
        secret: "DEMO-ONLY-PASSWORD-MAYA",
        service: "Vendor Travel Portal",
        serviceDomain: "travel.vendor.example",
        sourceType: "breach" as const,
        sourceName: "Synthetic vendor portal breach",
        sourceRecordId: "DEMO-BREACH-014",
        observedAt: observedAt.breach,
        severity: "high" as const,
        confidence: "high" as const,
        operatorId: ids.operators.priya,
      },
      {
        id: ids.exposures.elias,
        sourceId: ids.sources.phishing,
        identityType: "personal_email" as const,
        identityValue: "elias.morgan@example.test",
        credentialKind: "password_hash" as const,
        secret: "DEMO-ONLY-HASH-ELIAS",
        service: "Personal Mail",
        serviceDomain: "mail.example.test",
        sourceType: "phishing" as const,
        sourceName: "Synthetic credential phishing report",
        sourceRecordId: "DEMO-PHISH-008",
        observedAt: observedAt.phishing,
        severity: "medium" as const,
        confidence: "medium" as const,
        operatorId: ids.operators.omar,
      },
    ];

    for (const fixture of exposureFixtures) {
      const normalizedIdentity = normalizeIdentity(
        fixture.identityType,
        fixture.identityValue,
      );
      const fingerprint = fingerprintSecret(
        fixture.secret,
        cryptoConfig.dataKey,
      );
      const encrypted = encryptSecret(
        fixture.secret,
        cryptoConfig.dataKey,
        cryptoConfig.keyVersion,
      );
      const dedupeKey = buildExposureDedupeKey({
        identityType: fixture.identityType,
        normalizedIdentity,
        credentialKind: fixture.credentialKind,
        credentialFingerprint: fingerprint,
        service: fixture.service,
        serviceDomain: fixture.serviceDomain,
        sourceType: fixture.sourceType,
        sourceName: fixture.sourceName,
        sourceRecordId: fixture.sourceRecordId,
        observedAt: fixture.observedAt,
      });

      await transaction
        .insert(credentialExposures)
        .values({
          id: fixture.id,
          workspaceId: workspace.id,
          sourceId: fixture.sourceId,
          exposedIdentityType: fixture.identityType,
          exposedIdentityDisplay: fixture.identityValue,
          exposedIdentityNormalized: normalizedIdentity,
          service: fixture.service,
          serviceDomain: fixture.serviceDomain,
          credentialKind: fixture.credentialKind,
          credentialCiphertext: encrypted.ciphertext,
          credentialIv: encrypted.iv,
          credentialAuthTag: encrypted.authTag,
          credentialKeyVersion: encrypted.keyVersion,
          credentialFingerprint: fingerprint,
          credentialLength: fixture.secret.length,
          dedupeKey,
          observedAt: fixture.observedAt,
          severity: fixture.severity,
          confidence: fixture.confidence,
          verification: "confirmed",
          status: "in_case",
          notes: "Synthetic credential. Safe for demonstration only.",
          createdByOperatorId: fixture.operatorId,
        })
        .onConflictDoNothing();
    }

    await transaction
      .insert(exposureMatches)
      .values([
        {
          id: ids.matches.avery,
          exposureId: ids.exposures.avery,
          protecteeId: ids.protectees.avery,
          identityId: ids.identities.avery,
          method: "exact",
          confidence: "confirmed",
          confirmedByOperatorId: ids.operators.omar,
          confirmedAt: observedAt.stealer,
        },
        {
          id: ids.matches.maya,
          exposureId: ids.exposures.maya,
          protecteeId: ids.protectees.maya,
          identityId: ids.identities.maya,
          method: "exact",
          confidence: "high",
          confirmedByOperatorId: ids.operators.priya,
          confirmedAt: observedAt.breach,
        },
        {
          id: ids.matches.elias,
          exposureId: ids.exposures.elias,
          protecteeId: ids.protectees.elias,
          identityId: ids.identities.elias,
          method: "exact",
          confidence: "medium",
          confirmedByOperatorId: ids.operators.omar,
          confirmedAt: observedAt.phishing,
        },
      ])
      .onConflictDoNothing();

    await transaction
      .insert(responseCases)
      .values([
        {
          id: ids.cases.avery,
          workspaceId: workspace.id,
          protecteeId: ids.protectees.avery,
          title: "Active Northstar session exposed",
          status: "remediating",
          priority: "critical",
          assigneeOperatorId: ids.operators.lena,
          dueAt: new Date("2026-08-18T17:30:00.000Z"),
          openedAt: observedAt.stealer,
        },
        {
          id: ids.cases.maya,
          workspaceId: workspace.id,
          protecteeId: ids.protectees.maya,
          title: "Vendor portal password exposed",
          status: "investigating",
          priority: "high",
          assigneeOperatorId: ids.operators.priya,
          dueAt: new Date("2026-08-19T14:00:00.000Z"),
          openedAt: observedAt.breach,
        },
        {
          id: ids.cases.elias,
          workspaceId: workspace.id,
          protecteeId: ids.protectees.elias,
          title: "Personal mail hash under review",
          status: "monitoring",
          priority: "medium",
          assigneeOperatorId: ids.operators.omar,
          dueAt: new Date("2026-08-20T16:00:00.000Z"),
          openedAt: observedAt.phishing,
        },
      ])
      .onConflictDoNothing();

    await transaction
      .insert(caseExposures)
      .values([
        {
          caseId: ids.cases.avery,
          exposureId: ids.exposures.avery,
          attachedByOperatorId: ids.operators.omar,
        },
        {
          caseId: ids.cases.maya,
          exposureId: ids.exposures.maya,
          attachedByOperatorId: ids.operators.priya,
        },
        {
          caseId: ids.cases.elias,
          exposureId: ids.exposures.elias,
          attachedByOperatorId: ids.operators.omar,
        },
      ])
      .onConflictDoNothing();

    await transaction
      .insert(caseTasks)
      .values([
        {
          id: ids.tasks.averyRevoke,
          caseId: ids.cases.avery,
          type: "revoke_sessions",
          title: "Revoke active Northstar sessions",
          status: "in_progress",
          assigneeOperatorId: ids.operators.lena,
          dueAt: new Date("2026-08-18T17:00:00.000Z"),
        },
        {
          id: ids.tasks.averyReset,
          caseId: ids.cases.avery,
          type: "password_reset",
          title: "Rotate Northstar identity password",
          assigneeOperatorId: ids.operators.omar,
          dueAt: new Date("2026-08-18T17:15:00.000Z"),
        },
        {
          id: ids.tasks.mayaReset,
          caseId: ids.cases.maya,
          type: "password_reset",
          title: "Reset vendor portal password",
          assigneeOperatorId: ids.operators.priya,
          dueAt: new Date("2026-08-19T12:00:00.000Z"),
        },
        {
          id: ids.tasks.eliasVerify,
          caseId: ids.cases.elias,
          type: "verify",
          title: "Confirm whether the hash remains active",
          assigneeOperatorId: ids.operators.omar,
          dueAt: new Date("2026-08-20T15:00:00.000Z"),
        },
      ])
      .onConflictDoNothing();

    await transaction
      .insert(communications)
      .values({
        id: ids.communication,
        caseId: ids.cases.avery,
        channel: "phone",
        status: "planned",
        recipientLabel: "Avery Chen",
        subject: "Urgent credential remediation",
        createdByOperatorId: ids.operators.lena,
      })
      .onConflictDoNothing();

    await transaction
      .insert(activityLog)
      .values([
        {
          id: ids.activity.averyExposure,
          workspaceId: workspace.id,
          actorOperatorId: ids.operators.omar,
          action: "exposure.created",
          entityType: "credential_exposure",
          entityId: ids.exposures.avery,
          summary: "Session cookie exposure recorded for Avery Chen.",
          occurredAt: observedAt.stealer,
        },
        {
          id: ids.activity.averyCase,
          workspaceId: workspace.id,
          actorOperatorId: ids.operators.lena,
          action: "case.status_changed",
          entityType: "response_case",
          entityId: ids.cases.avery,
          summary: "Case moved to remediation.",
          occurredAt: new Date("2026-08-18T14:05:00.000Z"),
        },
        {
          id: ids.activity.mayaExposure,
          workspaceId: workspace.id,
          actorOperatorId: ids.operators.priya,
          action: "exposure.created",
          entityType: "credential_exposure",
          entityId: ids.exposures.maya,
          summary: "Password exposure recorded for Maya Rodriguez.",
          occurredAt: observedAt.breach,
        },
      ])
      .onConflictDoNothing();
  });

  const [workspaceCount] = await database
    .select({ count: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspace.id));

  if (!workspaceCount) {
    throw new Error("CredSignal seed verification failed.");
  }
}

seed()
  .then(() => {
    process.stdout.write("CredSignal synthetic demo data is ready.\n");
  })
  .finally(async () => {
    await closeDatabase();
  });
