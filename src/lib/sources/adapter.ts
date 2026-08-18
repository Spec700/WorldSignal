import type { SourceHealth, WorldEvent } from "@/lib/events/types";

export interface EventSourceAdapter {
  readonly source: SourceHealth["source"];

  fetchAndNormalize(input: {
    from: Date;
    to: Date;
    signal: AbortSignal;
  }): Promise<{
    events: WorldEvent[];
    upstreamUpdatedAt?: string;
  }>;
}
