export type CredSignalPriority = "low" | "medium" | "high" | "critical";

export interface CredSignalOperatorDto {
  id: string;
  displayName: string;
  email: string;
}

export interface CredSignalIdentityDto {
  id: string;
  type:
    "work_email" | "personal_email" | "username" | "phone" | "domain" | "other";
  displayValue: string;
  isPrimary: boolean;
  isActive: boolean;
}

export interface CredSignalLocationDto {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  precision: "exact" | "city" | "region" | "country";
}

export interface CredSignalExposureDto {
  id: string;
  exposedIdentity: string;
  identityType: CredSignalIdentityDto["type"];
  credentialKind:
    | "password"
    | "password_hash"
    | "session_token"
    | "session_cookie"
    | "api_key"
    | "other";
  hasCredentialValue: boolean;
  service?: string;
  serviceDomain?: string;
  sourceName: string;
  sourceType:
    | "breach"
    | "infostealer"
    | "phishing"
    | "combolist"
    | "paste"
    | "internal_report"
    | "other";
  severity: CredSignalPriority;
  confidence: "low" | "medium" | "high" | "confirmed";
  verification: "unverified" | "confirmed" | "false_positive";
  status: "new" | "triaged" | "in_case" | "remediated" | "dismissed";
  observedAt: string;
  notes?: string;
}

export interface CredSignalTaskDto {
  id: string;
  type:
    | "verify"
    | "notify"
    | "password_reset"
    | "revoke_sessions"
    | "enable_mfa"
    | "check_reuse"
    | "investigate_device"
    | "other";
  title: string;
  status: "todo" | "in_progress" | "completed" | "cancelled";
  assigneeName?: string;
  dueAt?: string;
  completedAt?: string;
}

export interface CredSignalCommunicationDto {
  id: string;
  channel: "email" | "phone" | "chat" | "in_person" | "other";
  status: "draft" | "planned" | "sent" | "acknowledged" | "failed";
  recipientLabel: string;
  subject?: string;
  body?: string;
  sentAt?: string;
  acknowledgedAt?: string;
  createdAt: string;
}

export interface CredSignalCaseDto {
  id: string;
  title: string;
  status:
    | "open"
    | "investigating"
    | "notifying"
    | "remediating"
    | "monitoring"
    | "closed"
    | "dismissed";
  priority: CredSignalPriority;
  assigneeId?: string;
  assigneeName?: string;
  dueAt?: string;
  openedAt: string;
  closedAt?: string;
  resolution?: string;
  exposureIds: string[];
  tasks: CredSignalTaskDto[];
  communications: CredSignalCommunicationDto[];
}

export interface CredSignalProtecteeDto {
  id: string;
  displayName: string;
  title?: string;
  organization?: string;
  tier: "standard" | "high" | "critical";
  status: "active" | "paused" | "archived";
  identities: CredSignalIdentityDto[];
  location?: CredSignalLocationDto;
  exposures: CredSignalExposureDto[];
  cases: CredSignalCaseDto[];
  activePriority?: CredSignalPriority;
  openCaseCount: number;
  openTaskCount: number;
}

export interface CredSignalActivityDto {
  id: string;
  action: string;
  summary: string;
  actorName?: string;
  entityType: string;
  entityId: string;
  occurredAt: string;
}

export interface CredSignalDashboardDto {
  setupRequired: boolean;
  workspace?: {
    id: string;
    name: string;
    slug: string;
  };
  operators: CredSignalOperatorDto[];
  protectees: CredSignalProtecteeDto[];
  unmatchedExposures: CredSignalExposureDto[];
  recentActivity: CredSignalActivityDto[];
  metrics: {
    protectees: number;
    openCases: number;
    criticalProtectees: number;
    overdueTasks: number;
    unmatchedExposures: number;
  };
}
