"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { CredSignalActivity } from "@/components/credsignal/credsignal-activity";
import { CredSignalCommandBar } from "@/components/credsignal/credsignal-command-bar";
import {
  CredSignalDossier,
  type CredSignalDossierTab,
} from "@/components/credsignal/credsignal-dossier";
import {
  CredSignalIntake,
  type CredSignalIntakeMode,
} from "@/components/credsignal/credsignal-intake";
import { CredSignalManageProtectee } from "@/components/credsignal/credsignal-manage-protectee";
import {
  CredSignalRail,
  type CredSignalQueueView,
} from "@/components/credsignal/credsignal-rail";
import { CredSignalTriage } from "@/components/credsignal/credsignal-triage";
import { ProductSwitcher } from "@/components/product-switcher/product-switcher";
import type { CredSignalDashboardDto } from "@/features/credsignal/types";

import styles from "@/app/credsignal/credsignal.module.css";

const CredSignalGlobe = dynamic(
  () =>
    import("@/components/credsignal/credsignal-globe").then(
      (module) => module.CredSignalGlobe,
    ),
  {
    loading: () => (
      <div className="globe-shell credsignal-globe-shell" role="status">
        <div className="globe-loading">Preparing protectee map…</div>
      </div>
    ),
    ssr: false,
  },
);

export function CredSignalWorkspace({
  dashboard,
}: {
  dashboard: CredSignalDashboardDto;
}) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<CredSignalQueueView>("protectees");
  const [query, setQuery] = useState("");
  const [selectedProtecteeId, setSelectedProtecteeId] = useState<string>();
  const [selectedExposureId, setSelectedExposureId] = useState<string>();
  const [dossierTab, setDossierTab] =
    useState<CredSignalDossierTab>("overview");
  const [intakeMode, setIntakeMode] = useState<CredSignalIntakeMode>();
  const [managingProtectee, setManagingProtectee] = useState(false);
  const [activeOperatorId, setActiveOperatorId] = useState(
    dashboard.operators[0]?.id ?? "",
  );

  const selectedProtectee = useMemo(
    () =>
      dashboard.protectees.find(
        (protectee) => protectee.id === selectedProtecteeId,
      ),
    [dashboard.protectees, selectedProtecteeId],
  );
  const activeProtectees = useMemo(
    () =>
      dashboard.protectees.filter((protectee) => protectee.status === "active"),
    [dashboard.protectees],
  );
  const selectedUnmatchedExposure = useMemo(
    () =>
      dashboard.unmatchedExposures.find(
        (exposure) => exposure.id === selectedExposureId,
      ),
    [dashboard.unmatchedExposures, selectedExposureId],
  );

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const editable =
        target?.matches("input, textarea, select, [contenteditable='true']") ??
        false;

      if (event.key === "/" && !editable) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape" && !editable) {
        if (intakeMode) {
          setIntakeMode(undefined);
        } else if (managingProtectee) {
          setManagingProtectee(false);
        } else if (selectedUnmatchedExposure) {
          setSelectedExposureId(undefined);
        } else {
          setSelectedProtecteeId(undefined);
        }
      }
    }
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [intakeMode, managingProtectee, selectedUnmatchedExposure]);

  const selectProtectee = useCallback(
    (protecteeId: string, tab: CredSignalDossierTab = "overview") => {
      setIntakeMode(undefined);
      setManagingProtectee(false);
      setSelectedExposureId(undefined);
      setSelectedProtecteeId(protecteeId);
      setDossierTab(tab);
    },
    [],
  );

  const selectUnmatchedExposure = useCallback((exposureId: string) => {
    setIntakeMode(undefined);
    setManagingProtectee(false);
    setSelectedProtecteeId(undefined);
    setSelectedExposureId(exposureId);
  }, []);

  const openIntake = useCallback((mode: CredSignalIntakeMode) => {
    setManagingProtectee(false);
    setSelectedProtecteeId(undefined);
    setSelectedExposureId(undefined);
    setIntakeMode(mode);
  }, []);

  const handleSaved = useCallback(
    (createdId?: string) => {
      setIntakeMode(undefined);
      setSelectedExposureId(undefined);
      setManagingProtectee(false);
      if (
        createdId &&
        dashboard.protectees.some((protectee) => protectee.id === createdId)
      ) {
        setSelectedProtecteeId(createdId);
      }
      router.refresh();
    },
    [dashboard.protectees, router],
  );

  const handleMatched = useCallback(
    (protecteeId: string) => {
      setSelectedExposureId(undefined);
      setManagingProtectee(false);
      setSelectedProtecteeId(protecteeId);
      setDossierTab("cases");
      router.refresh();
    },
    [router],
  );

  if (dashboard.setupRequired) {
    return (
      <main className={styles.setupShell}>
        <header className={styles.setupHeader}>
          <ProductSwitcher currentProduct="credsignal" />
        </header>
        <section className={styles.setupState}>
          <span className={styles.setupMark} aria-hidden="true">
            C
          </span>
          <span className={styles.eyebrow}>Local workspace required</span>
          <h1>Initialize CredSignal</h1>
          <p>
            PostgreSQL is connected, but the local workspace has not been
            seeded. Apply migrations and create the synthetic starter workspace.
          </p>
          <pre>
            <code>npm run db:migrate{"\n"}npm run db:seed</code>
          </pre>
        </section>
      </main>
    );
  }

  return (
    <div className={styles.shell}>
      <a className="skip-link" href="#credsignal-main">
        Skip to credential operations
      </a>
      <CredSignalCommandBar
        activeOperatorId={activeOperatorId}
        metrics={dashboard.metrics}
        onAddExposure={() => openIntake("exposure")}
        onOperatorChange={setActiveOperatorId}
        operators={dashboard.operators}
      />
      <div className={styles.workspace} id="credsignal-main">
        <CredSignalRail
          dashboard={dashboard}
          onAddProtectee={() => openIntake("protectee")}
          onQueryChange={setQuery}
          onSelectProtectee={selectProtectee}
          onSelectUnmatchedExposure={selectUnmatchedExposure}
          onViewChange={setView}
          query={query}
          searchRef={searchRef}
          selectedExposureId={selectedExposureId}
          selectedProtecteeId={selectedProtecteeId}
          view={view}
        />

        <main className={styles.stage}>
          <header className={styles.stageHeader}>
            <span>
              <strong>Global protectee view</strong>
              <small>
                Approved locations · aggregate unresolved credential risk
              </small>
            </span>
            <span className={styles.stageCount}>
              {
                activeProtectees.filter((protectee) => protectee.location)
                  .length
              }{" "}
              located protectees
            </span>
          </header>
          <div className={styles.globeArea}>
            <CredSignalGlobe
              onClearSelection={() => {
                setManagingProtectee(false);
                setSelectedProtecteeId(undefined);
                setSelectedExposureId(undefined);
              }}
              onSelect={(protecteeId) => selectProtectee(protecteeId)}
              protectees={dashboard.protectees}
              selectedProtectee={selectedProtectee}
            />
            {!selectedProtectee ? (
              <div className={styles.stageBrief}>
                <span className={styles.eyebrow}>Risk posture</span>
                <strong>
                  {dashboard.metrics.openCases} active response cases
                </strong>
                <p>
                  Select a protectee marker or queue item to coordinate
                  remediation.
                </p>
              </div>
            ) : null}
          </div>
          <footer className={styles.stageCredits}>
            <span>Locations are operator-maintained, not live tracking.</span>
            <a
              href="https://visibleearth.nasa.gov/collection/1484/blue-marble"
              rel="noopener noreferrer"
              target="_blank"
            >
              Imagery: NASA
            </a>
            <a
              href="https://www.naturalearthdata.com/"
              rel="noopener noreferrer"
              target="_blank"
            >
              Boundaries: Natural Earth
            </a>
          </footer>
        </main>

        {intakeMode ? (
          <CredSignalIntake
            activeOperatorId={activeOperatorId}
            mode={intakeMode}
            onClose={() => setIntakeMode(undefined)}
            onSaved={handleSaved}
            operators={dashboard.operators}
            protectees={activeProtectees}
          />
        ) : selectedUnmatchedExposure ? (
          <CredSignalTriage
            activeOperatorId={activeOperatorId}
            exposure={selectedUnmatchedExposure}
            key={selectedUnmatchedExposure.id}
            onClose={() => setSelectedExposureId(undefined)}
            onCreateProtectee={() => openIntake("protectee")}
            onMatched={handleMatched}
            protectees={activeProtectees}
          />
        ) : selectedProtectee && managingProtectee ? (
          <CredSignalManageProtectee
            activeOperatorId={activeOperatorId}
            key={selectedProtectee.id}
            onClose={() => setManagingProtectee(false)}
            protectee={selectedProtectee}
          />
        ) : selectedProtectee ? (
          <CredSignalDossier
            activeOperatorId={activeOperatorId}
            key={selectedProtectee.id}
            onClose={() => setSelectedProtecteeId(undefined)}
            onManage={() => setManagingProtectee(true)}
            onTabChange={setDossierTab}
            protectee={selectedProtectee}
            tab={dossierTab}
          />
        ) : null}
      </div>
      <CredSignalActivity activity={dashboard.recentActivity} />
    </div>
  );
}
