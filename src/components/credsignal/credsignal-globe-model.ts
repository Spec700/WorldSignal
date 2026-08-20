import type {
  CredSignalExposurePosture,
  CredSignalPriority,
  CredSignalProtecteeDto,
} from "@/features/credsignal/types";

const postureColor: Record<CredSignalExposurePosture, string> = {
  in_response: "#ff726b",
  confirmed_exposure: "#f2b35e",
  potential_exposure: "#69d2df",
  remediated: "#71d6a1",
  no_known_exposure: "#94acb6",
};

const posturePriority: Record<CredSignalExposurePosture, CredSignalPriority> = {
  in_response: "critical",
  confirmed_exposure: "high",
  potential_exposure: "medium",
  remediated: "low",
  no_known_exposure: "low",
};

const postureRank: Record<CredSignalExposurePosture, number> = {
  no_known_exposure: 0,
  remediated: 1,
  potential_exposure: 2,
  confirmed_exposure: 3,
  in_response: 4,
};

function exposurePosture(
  exposure: CredSignalProtecteeDto["exposures"][number],
): CredSignalExposurePosture {
  if (exposure.status === "remediated" || exposure.status === "dismissed") {
    return "remediated";
  }
  if (exposure.status === "in_case") {
    return "in_response";
  }
  return exposure.verification === "confirmed"
    ? "confirmed_exposure"
    : "potential_exposure";
}

export function credentialPostureForProtectee(
  protectee: CredSignalProtecteeDto,
): CredSignalExposurePosture {
  const postures = [
    ...protectee.credentials.map((credential) => credential.exposurePosture),
    ...protectee.exposures
      .filter((exposure) => !exposure.credentialId)
      .map(exposurePosture),
  ];

  return postures.reduce<CredSignalExposurePosture>(
    (highest, posture) =>
      postureRank[posture] > postureRank[highest] ? posture : highest,
    "no_known_exposure",
  );
}

export function credentialPriorityForProtectee(
  protectee: CredSignalProtecteeDto,
): CredSignalPriority {
  return posturePriority[credentialPostureForProtectee(protectee)];
}

export interface CredSignalGlobePoint {
  id: string;
  latitude: number;
  longitude: number;
  color: string;
  radius: number;
  altitude: number;
  displayName: string;
  organization?: string;
  locationLabel: string;
  posture: CredSignalExposurePosture;
  priority: CredSignalPriority;
  credentialCount: number;
  exposedCredentialCount: number;
  unlinkedExposureCount: number;
  openCaseCount: number;
  openTaskCount: number;
}

export function toCredSignalGlobePoints(
  protectees: CredSignalProtecteeDto[],
): CredSignalGlobePoint[] {
  return protectees.flatMap((protectee) => {
    if (!protectee.location || protectee.status !== "active") {
      return [];
    }
    const posture = credentialPostureForProtectee(protectee);
    const priority = posturePriority[posture];
    const credentialCount = protectee.credentials.filter(
      (credential) => credential.status !== "retired",
    ).length;
    const exposedCredentialCount = protectee.credentials.filter(
      (credential) =>
        credential.exposurePosture === "potential_exposure" ||
        credential.exposurePosture === "confirmed_exposure" ||
        credential.exposurePosture === "in_response",
    ).length;
    const unlinkedExposureCount = protectee.exposures.filter(
      (exposure) =>
        !exposure.credentialId &&
        exposure.status !== "remediated" &&
        exposure.status !== "dismissed",
    ).length;

    return [
      {
        id: protectee.id,
        latitude: protectee.location.latitude,
        longitude: protectee.location.longitude,
        color: postureColor[posture],
        radius: 0.2 + Math.min(credentialCount, 4) * 0.025,
        altitude: 0.014,
        displayName: protectee.displayName,
        organization: protectee.organization,
        locationLabel: protectee.location.label,
        posture,
        priority,
        credentialCount,
        exposedCredentialCount,
        unlinkedExposureCount,
        openCaseCount: protectee.openCaseCount,
        openTaskCount: protectee.openTaskCount,
      },
    ];
  });
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character] ?? character,
  );
}

export function credSignalPointTooltip(point: CredSignalGlobePoint): string {
  const posture = escapeHtml(point.posture.replaceAll("_", " "));
  const name = escapeHtml(point.displayName);
  const location = escapeHtml(point.locationLabel);
  const organization = point.organization
    ? ` · ${escapeHtml(point.organization)}`
    : "";

  const credentials = `${point.credentialCount} credential${point.credentialCount === 1 ? "" : "s"}`;
  const exposed = `${point.exposedCredentialCount} exposed`;
  const unlinked = point.unlinkedExposureCount
    ? ` · ${point.unlinkedExposureCount} unlinked finding${point.unlinkedExposureCount === 1 ? "" : "s"}`
    : "";

  return `<div class="globe-tooltip"><span>Credential posture · ${posture}</span><strong>${name}</strong><small>${location}${organization} · ${credentials} · ${exposed}${unlinked}</small></div>`;
}
