import type { SourceHealth } from "@/lib/events/types";
import { formatLocalTimestamp } from "@/lib/time/format";
import { SourceHealthSummary } from "@/components/source-health/source-health";

interface CommandBarProps {
  loadedCount: number;
  visibleCount: number;
  generatedAt?: string;
  batchIsPrevious: boolean;
  sourceHealth: SourceHealth[];
  refreshing: boolean;
  hasLoadedBatch: boolean;
  onRefresh: () => void;
}

export function CommandBar({
  loadedCount,
  visibleCount,
  generatedAt,
  batchIsPrevious,
  sourceHealth,
  refreshing,
  hasLoadedBatch,
  onRefresh,
}: CommandBarProps) {
  return (
    <header className="command-bar">
      <div className="wordmark-lockup" aria-label="WorldSignal">
        <span className="wordmark-symbol" aria-hidden="true">
          W
        </span>
        <span className="wordmark">WorldSignal</span>
      </div>

      <div className="command-module">
        <span className="command-label">Module</span>
        <span>Natural Hazards</span>
      </div>

      <div className="command-summary" aria-label="Event query summary">
        <span className="command-label">Visible / loaded</span>
        <strong>
          {visibleCount} / {loadedCount}
        </strong>
      </div>

      <div className="command-spacer" />

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
        disabled={refreshing}
        onClick={onRefresh}
        type="button"
      >
        <span className="refresh-button-icon" aria-hidden="true">
          ↻
        </span>
        {refreshing
          ? "Refreshing…"
          : hasLoadedBatch
            ? "Refresh"
            : "Load current events"}
      </button>
    </header>
  );
}
