import {
  buildExposureDedupeKey,
  classifyCredentialSeverity,
  createCaseCommunicationInputSchema,
  createCaseTaskInputSchema,
  createExposureInputSchema,
  matchExposureInputSchema,
  updateCaseCoordinationInputSchema,
} from "@/features/credsignal/domain";

describe("CredSignal domain rules", () => {
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

  it("accepts only unsent states when logging a new communication", () => {
    const input = {
      caseId: "50000000-0000-4000-8000-000000000001",
      channel: "email",
      recipientLabel: "Jordan Kim",
      subject: "Credential response",
      body: "Contact through the approved channel.",
    };

    expect(
      createCaseCommunicationInputSchema.safeParse({
        ...input,
        status: "planned",
      }).success,
    ).toBe(true);
    expect(
      createCaseCommunicationInputSchema.safeParse({
        ...input,
        status: "sent",
      }).success,
    ).toBe(false);
  });

  it("validates case accountability and optional task targets", () => {
    const caseId = "50000000-0000-4000-8000-000000000001";

    expect(
      updateCaseCoordinationInputSchema.safeParse({
        caseId,
        assigneeOperatorId: "",
        priority: "critical",
        dueAt: "2026-08-19T20:00",
      }).success,
    ).toBe(true);
    expect(
      updateCaseCoordinationInputSchema.safeParse({
        caseId,
        assigneeOperatorId: "",
        priority: "critical",
        dueAt: "",
      }).success,
    ).toBe(false);
    expect(
      createCaseTaskInputSchema.safeParse({
        caseId,
        type: "enable_mfa",
        title: "Require phishing-resistant MFA",
        assigneeOperatorId: "",
        dueAt: "",
        notes: "",
      }).success,
    ).toBe(true);
  });
});
