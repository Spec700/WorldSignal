"use client";

import { formatLocalTimestamp } from "@/lib/time/format";

export function LocalTimestamp({
  timestamp,
  style = "compact",
}: {
  timestamp: string;
  style?: "compact" | "full";
}) {
  return (
    <time dateTime={timestamp} suppressHydrationWarning>
      {formatLocalTimestamp(timestamp, style)}
    </time>
  );
}
