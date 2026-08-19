import { readFileSync } from "node:fs";

import { z } from "zod";

import { decodeCredentialDataKey } from "@/lib/credentials/data-key";

const credentialCryptoConfigSchema = z.object({
  dataKey: z
    .string()
    .min(1)
    .superRefine((value, context) => {
      try {
        decodeCredentialDataKey(value);
      } catch (error) {
        context.addIssue({
          code: "custom",
          message: error instanceof Error ? error.message : "Invalid data key.",
        });
      }
    }),
  keyVersion: z.string().min(1).max(64),
});

function readConfiguredDataKey(): string | undefined {
  const inlineKey = process.env.CREDSIGNAL_DATA_KEY?.trim();
  const keyFile = process.env.CREDSIGNAL_DATA_KEY_FILE?.trim();

  if (inlineKey && keyFile) {
    throw new Error(
      "Configure either CREDSIGNAL_DATA_KEY or CREDSIGNAL_DATA_KEY_FILE, not both.",
    );
  }

  if (!keyFile) {
    return inlineKey;
  }

  try {
    return readFileSync(keyFile, "utf8").trim();
  } catch (error) {
    throw new Error(
      `CredSignal could not read its data key file at ${keyFile}.`,
      {
        cause: error,
      },
    );
  }
}

export function getCredentialCryptoConfig() {
  return credentialCryptoConfigSchema.parse({
    dataKey: readConfiguredDataKey(),
    keyVersion: process.env.CREDSIGNAL_KEY_VERSION,
  });
}
