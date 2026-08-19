import {
  createPersonInputSchema,
  normalizeIdentity,
} from "@/features/people/domain";

describe("People domain rules", () => {
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

  it("validates person coordinates at intake", () => {
    const result = createPersonInputSchema.safeParse({
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
});
