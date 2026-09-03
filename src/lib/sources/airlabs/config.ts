import { createHash } from "node:crypto";

import { AirLabsSourceError } from "./errors";

export interface AirLabsConfiguration {
  apiKey: string;
  keyFingerprint: string;
}

export function getAirLabsConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): AirLabsConfiguration {
  const apiKey = environment.AIRLABS_API_KEY?.trim();
  if (!apiKey) {
    throw new AirLabsSourceError(
      "unknown",
      "AirLabs is paused because AIRLABS_API_KEY is not configured.",
      "pause",
    );
  }

  return {
    apiKey,
    keyFingerprint: createHash("sha256")
      .update(apiKey)
      .digest("hex")
      .slice(0, 16),
  };
}
