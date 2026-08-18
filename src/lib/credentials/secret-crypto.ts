import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

import { z } from "zod";

const IV_BYTES = 12;
const KEY_BYTES = 32;
const algorithm = "aes-256-gcm";

export const encryptedSecretSchema = z.object({
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
  authTag: z.string().min(1),
  keyVersion: z.string().min(1).max(64),
});

export type EncryptedSecret = z.infer<typeof encryptedSecretSchema>;

function decodeMasterKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, "base64");

  if (key.length !== KEY_BYTES) {
    throw new Error(
      "CREDSIGNAL_DATA_KEY must be a base64-encoded 32-byte key.",
    );
  }

  return key;
}

function deriveKey(masterKey: Buffer, purpose: "encryption" | "fingerprint") {
  return createHmac("sha256", masterKey)
    .update(`priority-signals:credsignal:${purpose}:v1`, "utf8")
    .digest();
}

export function encryptSecret(
  plaintext: string,
  encodedMasterKey: string,
  keyVersion: string,
): EncryptedSecret {
  if (plaintext.length === 0) {
    throw new Error("Credential values cannot be empty.");
  }

  const masterKey = decodeMasterKey(encodedMasterKey);
  const encryptionKey = deriveKey(masterKey, "encryption");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(algorithm, encryptionKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion,
  };
}

export function decryptSecret(
  encrypted: EncryptedSecret,
  encodedMasterKey: string,
): string {
  const parsed = encryptedSecretSchema.parse(encrypted);
  const masterKey = decodeMasterKey(encodedMasterKey);
  const encryptionKey = deriveKey(masterKey, "encryption");
  const decipher = createDecipheriv(
    algorithm,
    encryptionKey,
    Buffer.from(parsed.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(parsed.authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(parsed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function fingerprintSecret(
  plaintext: string,
  encodedMasterKey: string,
): string {
  if (plaintext.length === 0) {
    throw new Error("Credential values cannot be empty.");
  }

  const masterKey = decodeMasterKey(encodedMasterKey);
  const fingerprintKey = deriveKey(masterKey, "fingerprint");

  return createHmac("sha256", fingerprintKey)
    .update(plaintext, "utf8")
    .digest("hex");
}
