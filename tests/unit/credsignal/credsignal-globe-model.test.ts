import {
  credSignalPointTooltip,
  toCredSignalGlobePoints,
} from "@/components/credsignal/credsignal-globe-model";
import type { CredSignalProtecteeDto } from "@/features/credsignal/types";

const credential: CredSignalProtecteeDto["credentials"][number] = {
  id: "d0000000-0000-4000-8000-000000000001",
  protecteeId: "30000000-0000-4000-8000-000000000001",
  protecteeName: "Avery Chen",
  accountIdentifier: "avery@northstar.example",
  service: "Northstar Identity",
  serviceDomain: "id.northstar.example",
  credentialKind: "session_cookie",
  status: "active",
  exposurePosture: "in_response",
  exposures: [],
  versions: [],
  openCaseCount: 1,
  updatedAt: "2026-08-18T12:00:00.000Z",
};

function protectee(
  overrides: Partial<CredSignalProtecteeDto> = {},
): CredSignalProtecteeDto {
  return {
    id: "30000000-0000-4000-8000-000000000001",
    displayName: "Avery Chen",
    organization: "Northstar <Labs>",
    tier: "critical",
    status: "active",
    identities: [],
    location: {
      id: "50000000-0000-4000-8000-000000000001",
      label: "New York & region",
      latitude: 40.7128,
      longitude: -74.006,
      precision: "city",
      isActive: true,
      effectiveFrom: "2026-08-01T12:00:00.000Z",
    },
    credentials: [credential],
    exposures: [],
    cases: [],
    activePriority: "critical",
    openCaseCount: 2,
    openTaskCount: 3,
    locationHistory: [],
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-18T12:00:00.000Z",
    ...overrides,
  };
}

describe("CredSignal globe model", () => {
  it("creates one point per active located protectee", () => {
    const points = toCredSignalGlobePoints([
      protectee(),
      protectee({
        id: "30000000-0000-4000-8000-000000000002",
        status: "paused",
      }),
      protectee({
        id: "30000000-0000-4000-8000-000000000003",
        location: undefined,
      }),
    ]);

    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({
      displayName: "Avery Chen",
      posture: "in_response",
      priority: "critical",
      credentialCount: 1,
      exposedCredentialCount: 1,
      openCaseCount: 2,
    });
  });

  it("escapes user-controlled tooltip content", () => {
    const [point] = toCredSignalGlobePoints([protectee()]);
    const tooltip = credSignalPointTooltip(point);

    expect(tooltip).toContain("Northstar &lt;Labs&gt;");
    expect(tooltip).toContain("New York &amp; region");
    expect(tooltip).toContain("Credential posture · in response");
    expect(tooltip).toContain("1 credential · 1 exposed");
    expect(tooltip).not.toContain("<Labs>");
  });

  it("keeps person-matched evidence visible when no credential is confirmed", () => {
    const [point] = toCredSignalGlobePoints([
      protectee({
        credentials: [],
        exposures: [
          {
            id: "70000000-0000-4000-8000-000000000001",
            matchedProtecteeId: "30000000-0000-4000-8000-000000000001",
            exposedIdentity: "avery@northstar.example",
            identityType: "work_email",
            credentialKind: "password",
            sourceType: "breach",
            sourceName: "Synthetic breach",
            observedAt: "2026-08-18T12:00:00.000Z",
            severity: "high",
            confidence: "high",
            verification: "confirmed",
            status: "triaged",
            hasCredentialValue: false,
          },
        ],
      }),
    ]);

    expect(point).toMatchObject({
      posture: "confirmed_exposure",
      priority: "high",
      credentialCount: 0,
      exposedCredentialCount: 0,
      unlinkedExposureCount: 1,
    });
  });
});
