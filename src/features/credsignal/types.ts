import type {
  PersonDto,
  PersonIdentityDto,
  PersonLocationDto,
  PrioritySignalsOperatorDto,
} from "@/features/people/types";

export type CredSignalPriority = "low" | "medium" | "high" | "critical";

export type CredSignalOperatorDto = PrioritySignalsOperatorDto;
export type CredSignalIdentityDto = PersonIdentityDto;
export type CredSignalLocationDto = PersonLocationDto;

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
  assigneeId?: string;
  assigneeName?: string;
  dueAt?: string;
  completedAt?: string;
  notes?: string;
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

export interface CredSignalProtecteeDto extends PersonDto {
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
