const CREDENTIAL_DATA_KEY_BYTES = 32;

export function decodeCredentialDataKey(encodedKey: string): Buffer {
  const normalizedKey = encodedKey.trim();
  const key = Buffer.from(normalizedKey, "base64");

  if (
    key.length !== CREDENTIAL_DATA_KEY_BYTES ||
    key.toString("base64") !== normalizedKey
  ) {
    throw new Error(
      "CREDSIGNAL_DATA_KEY must be a canonical base64-encoded 32-byte key.",
    );
  }

  return key;
}
