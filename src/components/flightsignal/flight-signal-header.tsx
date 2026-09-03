"use client";

import { ProductSwitcher } from "@/components/product-switcher/product-switcher";
import type { FlightSignalDashboardDto } from "@/features/flights/types";

import styles from "@/app/flightsignal/flightsignal.module.css";

interface FlightSignalHeaderProps {
  activeOperatorId: string;
  dashboard: FlightSignalDashboardDto;
  onOperatorChange: (operatorId: string) => void;
  onTrackFlight: () => void;
}

export function FlightSignalHeader({
  activeOperatorId,
  dashboard,
  onOperatorChange,
  onTrackFlight,
}: FlightSignalHeaderProps) {
  return (
    <header className={styles.commandBar}>
      <ProductSwitcher currentProduct="flightsignal" />
      <div className={styles.commandModule}>
        <span className={styles.commandLabel}>Module</span>
        <span>Travel operations</span>
      </div>
      <dl className={styles.commandMetrics} aria-label="FlightSignal summary">
        <div>
          <dt>Tracked</dt>
          <dd>{dashboard.metrics.tracked}</dd>
        </div>
        <div>
          <dt>Traveling</dt>
          <dd>{dashboard.metrics.activeTravelers}</dd>
        </div>
        <div data-attention={dashboard.metrics.attention > 0}>
          <dt>Attention</dt>
          <dd>{dashboard.metrics.attention}</dd>
        </div>
      </dl>
      <div className={styles.sourceSummary}>
        <span
          className={styles.sourceDot}
          data-error={
            dashboard.metrics.sourceErrors > 0 ||
            !dashboard.source.available ||
            dashboard.source.paused
          }
        />
        <span>
          <strong>{dashboard.source.label}</strong>
          <small>
            {dashboard.source.paused
              ? "Paused"
              : dashboard.source.available
                ? dashboard.source.providerMonthlyRemaining !== undefined
                  ? `${dashboard.source.planType ?? "API"} · ${dashboard.source.providerMonthlyRemaining} requests left`
                  : `${dashboard.source.automationRequestCount}/${dashboard.source.automationRequestCap} automated · ${dashboard.source.interactiveRequestCount} analyst`
                : "API key required"}
          </small>
        </span>
      </div>
      <label className={styles.operatorControl}>
        <span className={styles.commandLabel}>Demo operator · no auth</span>
        <select
          aria-label="Active demo operator"
          onChange={(event) => onOperatorChange(event.target.value)}
          value={activeOperatorId}
        >
          <option value="">Unattributed operator</option>
          {dashboard.operators.map((operator) => (
            <option key={operator.id} value={operator.id}>
              {operator.displayName}
            </option>
          ))}
        </select>
      </label>
      <button
        className={styles.primaryAction}
        onClick={onTrackFlight}
        type="button"
      >
        <span aria-hidden="true">＋</span>
        Track flight
      </button>
    </header>
  );
}
