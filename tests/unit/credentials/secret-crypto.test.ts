import {
  decryptSecret,
  encryptSecret,
  fingerprintSecret,
} from "@/lib/credentials/secret-crypto";

const dataKey = Buffer.alloc(32, 7).toString("base64");
const otherDataKey = Buffer.alloc(32, 8).toString("base64");

describe("CredSignal secret encryption", () => {
  it("round-trips a full credential value", () => {
    const encrypted = encryptSecret(
      "correct horse battery staple",
      dataKey,
      "test-v1",
    );

    expect(encrypted.ciphertext).not.toContain("correct horse");
    expect(encrypted.keyVersion).toBe("test-v1");
    expect(decryptSecret(encrypted, dataKey)).toBe(
      "correct horse battery staple",
    );
  });

  it("uses a fresh nonce for every encryption", () => {
    const first = encryptSecret("same-value", dataKey, "test-v1");
    const second = encryptSecret("same-value", dataKey, "test-v1");

    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("rejects decryption with a different key", () => {
    const encrypted = encryptSecret("sensitive", dataKey, "test-v1");

    expect(() => decryptSecret(encrypted, otherDataKey)).toThrow();
  });

  it("creates stable keyed fingerprints without exposing the value", () => {
    const first = fingerprintSecret("reused-secret", dataKey);
    const second = fingerprintSecret("reused-secret", dataKey);
    const different = fingerprintSecret("different-secret", dataKey);

    expect(first).toBe(second);
    expect(first).not.toBe(different);
    expect(first).not.toContain("reused-secret");
  });

  it("rejects malformed keys and empty credential values", () => {
    expect(() => encryptSecret("value", "not-a-key", "test-v1")).toThrow(
      /base64-encoded 32-byte key/i,
    );
    expect(() => encryptSecret("", dataKey, "test-v1")).toThrow(
      /cannot be empty/i,
    );
    expect(() => fingerprintSecret("", dataKey)).toThrow(/cannot be empty/i);
  });
});
