import { z } from "zod";

const credentialCryptoConfigSchema = z.object({
  dataKey: z.string().min(1),
  keyVersion: z.string().min(1).max(64),
});

export function getCredentialCryptoConfig() {
  return credentialCryptoConfigSchema.parse({
    dataKey: process.env.CREDSIGNAL_DATA_KEY,
    keyVersion: process.env.CREDSIGNAL_KEY_VERSION,
  });
}
