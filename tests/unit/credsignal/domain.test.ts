import {
  buildExposureDedupeKey,
  classifyCredentialSeverity,
  createExposureInputSchema,
  createProtecteeInputSchema,
  matchExposureInputSchema,
  normalizeIdentity,
} from "@/features/credsignal/domain";

describe("CredSignal domain rules", () => {
  it("normalizes identities deterministically", () => {
    expect(normalizeIdentity("work_email", "  VIP@Example.COM ")).toBe(
      "vip@example.com",
    );
    expect(normalizeIdentity("phone", "+1 (202) 555-0142")).toBe(
      "+12025550142",
    );
    expect(normalizeIdentity("other", "  Executive   Alias ")).toBe(
      "executive alias",
    );
  });

  it("classifies active credentials above passive artifacts", () => {
    expect(classifyCredentialSeverity("session_cookie")).toBe("critical");
    expect(classifyCredentialSeverity("api_key")).toBe("critical");
    expect(classifyCredentialSeverity("password")).toBe("high");
    expect(classifyCredentialSeverity("password_hash")).toBe("medium");
    expect(classifyCredentialSeverity("other")).toBe("low");
  });

  it("creates stable dedupe keys from canonical exposure facts", () => {
    const fields = {
      identityType: "work_email" as const,
      normalizedIdentity: "vip@example.com",
      credentialKind: "password" as const,
      credentialFingerprint: "fingerprint",
      service: "Example Service",
      serviceDomain: "EXAMPLE.COM",
      sourceType: "breach" as const,
      sourceName: "Example Breach",
      sourceRecordId: "record-42",
      observedAt: new Date("2026-08-18T12:00:00.000Z"),
    };

    expect(buildExposureDedupeKey(fields)).toBe(
      buildExposureDedupeKey({
        ...fields,
        serviceDomain: "example.com",
        sourceName: " example breach ",
      }),
    );
    expect(buildExposureDedupeKey(fields)).not.toBe(
      buildExposureDedupeKey({ ...fields, sourceRecordId: "record-43" }),
    );
  });

  it("validates protectee coordinates at intake", () => {
    const result = createProtecteeInputSchema.safeParse({
      displayName: "Jordan Kim",
      title: "Chief Operating Officer",
      organization: "Example Organization",
      tier: "high",
      identityType: "work_email",
      identityValue: "jordan@example.com",
      locationLabel: "New York, NY",
      latitude: 91,
      longitude: -74,
    });

    expect(result.success).toBe(false);
  });

  it("limits credential intake payload size", () => {
    const result = createExposureInputSchema.safeParse({
      identityType: "username",
      identityValue: "jordan",
      credentialKind: "password",
      credentialValue: "x".repeat(65_537),
      sourceType: "internal_report",
      sourceName: "Manual report",
      observedAt: "2026-08-18T12:00:00.000Z",
      confidence: "confirmed",
    });

    expect(result.success).toBe(false);
  });

  it("requires an explicit rationale for manual exposure matching", () => {
    const identifiers = {
      exposureId: "70000000-0000-4000-8000-000000000001",
      protecteeId: "30000000-0000-4000-8000-000000000001",
      identityId: "40000000-0000-4000-8000-000000000001",
    };

    expect(
      matchExposureInputSchema.safeParse({ ...identifiers, reason: "   " })
        .success,
    ).toBe(false);
    expect(
      matchExposureInputSchema.safeParse({
        ...identifiers,
        reason: "Source context confirms this alias belongs to the protectee.",
      }).success,
    ).toBe(true);
  });
});
