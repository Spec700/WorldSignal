export type PersonTier = "standard" | "high" | "critical";

export type PersonStatus = "active" | "paused" | "archived";

export type PersonIdentityType =
  "work_email" | "personal_email" | "username" | "phone" | "domain" | "other";

export type PersonLocationPrecision = "exact" | "city" | "region" | "country";

export interface PrioritySignalsOperatorDto {
  id: string;
  displayName: string;
  email: string;
}

export interface PersonIdentityDto {
  id: string;
  type: PersonIdentityType;
  displayValue: string;
  isPrimary: boolean;
  isActive: boolean;
  verifiedAt?: string;
}

export interface PersonLocationDto {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  precision: PersonLocationPrecision;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface PersonDto {
  id: string;
  displayName: string;
  title?: string;
  organization?: string;
  tier: PersonTier;
  status: PersonStatus;
  notes?: string;
  identities: PersonIdentityDto[];
  location?: PersonLocationDto;
  locationHistory: PersonLocationDto[];
  createdAt: string;
  updatedAt: string;
}

export interface PeopleDashboardDto {
  setupRequired: boolean;
  workspace?: {
    id: string;
    name: string;
    slug: string;
  };
  operators: PrioritySignalsOperatorDto[];
  people: PersonDto[];
  metrics: {
    total: number;
    active: number;
    located: number;
    highAttention: number;
  };
}
