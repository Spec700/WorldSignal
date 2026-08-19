import type { HazardWindow, SourceHealth } from "@/lib/events/types";
import { formatLocalTimestamp } from "@/lib/time/format";
import { ProductSwitcher } from "@/components/product-switcher/product-switcher";
import { SourceHealthSummary } from "@/components/source-health/source-health";

interface CommandBarProps {
  loadedCount: number;
  visibleCount: number;
  generatedAt?: string;
  batchIsPrevious: boolean;
  sourceHealth: SourceHealth[];
  refreshing: boolean;
  hasLoadedBatch: boolean;
  cacheState: "checking" | "empty" | "saving" | "stored" | "error";
  batchOrigin: "none" | "retrieved" | "stored";
  window: HazardWindow;
  onRefresh: () => void;
}

function snapshotLabel(
  cacheState: CommandBarProps["cacheState"],
  batchOrigin: CommandBarProps["batchOrigin"],
): string {
  if (cacheState === "checking") {
    return "Checking browser";
  }
  if (cacheState === "saving") {
    return "Saving locally";
  }
  if (cacheState === "stored") {
    return batchOrigin === "stored" ? "Restored locally" : "Stored locally";
  }
  if (cacheState === "error") {
    return "Storage unavailable";
  }
  return "Not stored";
}

export function CommandBar({
  loadedCount,
  visibleCount,
  generatedAt,
  batchIsPrevious,
  sourceHealth,
  refreshing,
  hasLoadedBatch,
  cacheState,
  batchOrigin,
  window,
  onRefresh,
}: CommandBarProps) {
  return (
    <header className="command-bar">
      <ProductSwitcher currentProduct="worldsignal" />

      <div className="command-module">
        <span className="command-label">Module</span>
        <span>Natural Hazards</span>
      </div>

      <div
        className="command-summary"
        aria-label="Event query summary"
        role="group"
      >
        <span className="command-label">Visible / loaded</span>
        <strong>
          {visibleCount} / {loadedCount}
        </strong>
      </div>

      <div className="command-snapshot" aria-label="Browser snapshot status">
        <span className="command-label">Snapshot</span>
        <span>
          {window.toUpperCase()} · {snapshotLabel(cacheState, batchOrigin)}
        </span>
      </div>

      <SourceHealthSummary health={sourceHealth} refreshing={refreshing} />

      <div className="retrieval-stamp">
        <span className="command-label">
          {batchIsPrevious ? "Previous retrieval" : "Last retrieved"}
        </span>
        <span>{generatedAt ? formatLocalTimestamp(generatedAt) : "Never"}</span>
      </div>

      <button
        aria-busy={refreshing}
        className="refresh-button"
        disabled={refreshing || cacheState === "checking"}
        onClick={onRefresh}
        type="button"
      >
        <span className="refresh-button-icon" aria-hidden="true">
          ↻
        </span>
        {cacheState === "checking"
          ? "Restoring…"
          : refreshing
            ? "Refreshing…"
            : hasLoadedBatch
              ? "Refresh"
              : "Load current events"}
      </button>
    </header>
  );
}
