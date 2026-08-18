import { ProductSwitcher } from "@/components/product-switcher/product-switcher";
import type {
  CredSignalDashboardDto,
  CredSignalOperatorDto,
} from "@/features/credsignal/types";

import styles from "@/app/credsignal/credsignal.module.css";

interface CredSignalCommandBarProps {
  metrics: CredSignalDashboardDto["metrics"];
  operators: CredSignalOperatorDto[];
  activeOperatorId: string;
  onOperatorChange: (operatorId: string) => void;
  onAddExposure: () => void;
}

export function CredSignalCommandBar({
  metrics,
  operators,
  activeOperatorId,
  onOperatorChange,
  onAddExposure,
}: CredSignalCommandBarProps) {
  return (
    <header className={styles.commandBar}>
      <ProductSwitcher currentProduct="credsignal" />

      <div className={styles.commandModule}>
        <span className={styles.commandLabel}>Module</span>
        <span>Credential Exposure</span>
      </div>

      <dl className={styles.commandMetrics} aria-label="CredSignal summary">
        <div>
          <dt>Protectees</dt>
          <dd>{metrics.protectees}</dd>
        </div>
        <div>
          <dt>Open cases</dt>
          <dd>{metrics.openCases}</dd>
        </div>
        <div
          className={
            metrics.criticalProtectees > 0 ? styles.criticalMetric : undefined
          }
        >
          <dt>Critical</dt>
          <dd>{metrics.criticalProtectees}</dd>
        </div>
        <div>
          <dt>Overdue</dt>
          <dd>{metrics.overdueTasks}</dd>
        </div>
      </dl>

      <label className={styles.operatorControl}>
        <span className={styles.commandLabel}>Demo operator · no auth</span>
        <select
          aria-label="Active demo operator"
          onChange={(event) => onOperatorChange(event.target.value)}
          value={activeOperatorId}
        >
          <option value="">Unattributed operator</option>
          {operators.map((operator) => (
            <option key={operator.id} value={operator.id}>
              {operator.displayName}
            </option>
          ))}
        </select>
      </label>

      <button
        className={styles.primaryAction}
        onClick={onAddExposure}
        type="button"
      >
        <span aria-hidden="true">＋</span>
        Add exposure
      </button>
    </header>
  );
}
