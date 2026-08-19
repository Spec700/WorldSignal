"use client";

import Link from "next/link";

import { ProductSwitcher } from "@/components/product-switcher/product-switcher";
import type {
  PeopleDashboardDto,
  PrioritySignalsOperatorDto,
} from "@/features/people/types";

import styles from "@/app/home/home.module.css";

interface HomeHeaderProps {
  activeOperatorId: string;
  currentView: "people" | "globe";
  metrics: PeopleDashboardDto["metrics"];
  onAddPerson: () => void;
  onOperatorChange: (operatorId: string) => void;
  operators: PrioritySignalsOperatorDto[];
}

export function HomeHeader({
  activeOperatorId,
  currentView,
  metrics,
  onAddPerson,
  onOperatorChange,
  operators,
}: HomeHeaderProps) {
  return (
    <>
      <header className={styles.commandBar}>
        <ProductSwitcher currentProduct="home" />
        <div className={styles.commandModule}>
          <span className={styles.commandLabel}>Module</span>
          <span>People</span>
        </div>
        <dl className={styles.commandMetrics} aria-label="People summary">
          <div>
            <dt>Roster</dt>
            <dd>{metrics.total}</dd>
          </div>
          <div>
            <dt>Active</dt>
            <dd>{metrics.active}</dd>
          </div>
          <div>
            <dt>Located</dt>
            <dd>{metrics.located}</dd>
          </div>
          <div data-attention={metrics.highAttention > 0}>
            <dt>High attention</dt>
            <dd>{metrics.highAttention}</dd>
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
          onClick={onAddPerson}
          type="button"
        >
          <span aria-hidden="true">＋</span>
          Add person
        </button>
      </header>

      <div className={styles.moduleBar}>
        <div>
          <span className={styles.eyebrow}>Home module</span>
          <strong>Priority roster</strong>
        </div>
        <nav aria-label="Home views">
          {currentView === "people" ? (
            <span aria-current="page">People</span>
          ) : (
            <Link href="/home">People</Link>
          )}
          {currentView === "globe" ? (
            <span aria-current="page">Globe</span>
          ) : (
            <Link href="/home/globe">Globe</Link>
          )}
        </nav>
        <p>People and locations form the shared context for every signal.</p>
      </div>
    </>
  );
}
