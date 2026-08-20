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
  view?: "inventory" | "globe";
  onAddCredential?: () => void;
  onAddExposure?: () => void;
}

export function CredSignalCommandBar({
  metrics,
  operators,
  activeOperatorId,
  onOperatorChange,
  view = "globe",
  onAddCredential,
  onAddExposure,
}: CredSignalCommandBarProps) {
  const inventoryView = view === "inventory";

  return (
    <header className={styles.commandBar}>
      <ProductSwitcher currentProduct="credsignal" />

      <div className={styles.commandModule}>
        <span className={styles.commandLabel}>Module</span>
        <span>
          {inventoryView ? "People Operations" : "Credential Posture"}
        </span>
      </div>

      <dl className={styles.commandMetrics} aria-label="CredSignal summary">
        <div>
          <dt>People</dt>
          <dd>{metrics.protectees}</dd>
        </div>
        <div>
          <dt>Credentials</dt>
          <dd>{metrics.credentials}</dd>
        </div>
        <div
          className={
            metrics.exposedCredentials > 0 ? styles.criticalMetric : undefined
          }
        >
          <dt>Exposed</dt>
          <dd>{metrics.exposedCredentials}</dd>
        </div>
        <div>
          <dt>Open cases</dt>
          <dd>{metrics.openCases}</dd>
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
        onClick={inventoryView ? onAddCredential : onAddExposure}
        type="button"
      >
        <span aria-hidden="true">＋</span>
        {inventoryView ? "Add credential" : "Add exposure"}
      </button>
    </header>
  );
}
