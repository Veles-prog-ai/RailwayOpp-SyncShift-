export type SegmentView = 'landing' | 'mobile' | 'admin' | 'dispatcher';
export type NodeId = 'mobile' | 'office';

export type StationName =
  | 'Beograd Centar'
  | 'Lapovo'
  | 'Niš'
  | 'Dimitrovgrad'
  | 'Subotica';

export type ClientOperator = string;

export type DriverStatus =
  | 'Dostupan'
  | 'Na smeni'
  | 'Obavezan odmor'
  | 'Vanredno angažovan';

export interface Driver {
  id: string;
  name: string;
  licenseCode: string;
  homeStation: StationName;
  currentStation: StationName;
  status: DriverStatus;
  lastShiftEndTime: string;
  lastShiftEndedAwayFromBase: boolean;
  phone: string;
}

export type ShiftSegmentType =
  | 'priprema'
  | 'upravljanje'
  | 'čekanje_reži'
  | 'rasprema';

export interface ShiftSegment {
  id: string;
  type: ShiftSegmentType;
  label: string;
  startTime: string;
  endTime: string;
  durationHours: number;
}

export type ShiftStatus = 'Planirana' | 'U toku' | 'Završena';

export type OvertimeClassification =
  | 'Standardno'
  | 'Noćni rad'
  | 'Vanredni prekovremeni (zakonski uvećano)';

export interface Shift {
  id: string;
  driverId: string;
  clientOperator: ClientOperator;
  routeFrom: StationName;
  routeTo: StationName;
  trainNumber: string;
  locomotiveCode: string;
  startTime: string;
  endTime: string;
  segments: ShiftSegment[];
  status: ShiftStatus;
  isEmergencyOverride: boolean;
  overrideReason?: string;
  overtimeClassification: OvertimeClassification;
  vehicleKmUsed: number;
  notes?: string;
}

export interface VehicleEquipment {
  radioStanica: boolean;
  ključevi: boolean;
  prsluk: boolean;
  dokumentacija: boolean;
}

export type VehicleStatus = 'Parkirano' | 'U upotrebi' | 'Servisno upozorenje';

export interface CompanyVehicle {
  id: string;
  model: string;
  plate: string;
  currentStation: StationName;
  status: VehicleStatus;
  assignedDriverId: string | null;
  mileageKm: number;
  nextServiceKm: number;
  fuelPercent: number;
  conditionNote: string;
  equipment: VehicleEquipment;
  lastHandoverAt: string;
}

export type TelemetryType =
  | 'POČETAK_SMENE'
  | 'ZAVRŠETAK_SMENE'
  | 'PROLAZNO_VREME'
  | 'PAUZA'
  | 'ZASTOJ_KVAR'
  | 'PREUZIMANJE_VOZILA'
  | 'PREDAJA_VOZILA';

export type TelemetryClassification =
  | 'Redovan rad'
  | 'Zastoj / Tehnički kvar'
  | 'Reži putovanje'
  | 'Flota i oprema';

export interface TelemetryLog {
  id: string;
  timestamp: string;
  driverId: string;
  shiftId?: string;
  type: TelemetryType;
  classification: TelemetryClassification;
  station: StationName;
  route?: string;
  trainNumber?: string;
  delayMinutes?: number;
  description: string;
  pendingSync: boolean;
  syncedAt?: string;
}

export interface DispatchMessage {
  id: string;
  recipientDriverId: string;
  senderName: string;
  title: string;
  body: string;
  priority: 'Hitno' | 'Obaveštenje';
  createdAt: string;
  acknowledgedAtByDriver: Record<string, string>;
}

export interface RuleConfig {
  minRestHomeHours: number;
  minRestAwayHours: number;
  maxDrivingHours: number;
  maxTotalShiftHours: number;
}

export interface RuleCheckDetail {
  ruleName: string;
  passed: boolean;
  message: string;
}

export interface RuleEvaluationResult {
  allowed: boolean;
  checks: RuleCheckDetail[];
  summaryMessage: string;
  requiredRestHours: number;
  actualRestHours: number;
  drivingHours: number;
  totalShiftHours: number;
  hasOverlap: boolean;
}

export interface RuleValidationLog {
  id: string;
  timestamp: string;
  actionLabel: string;
  driverId: string;
  driverName: string;
  shiftId?: string;
  passed: boolean;
  overridden: boolean;
  overrideReason?: string;
  checks: RuleCheckDetail[];
  summaryMessage: string;
}

export type AuditActionType =
  | 'VANREDNO_ODOBRENJE'
  | 'PRERASPODELA'
  | 'VOZILO_PRIMOPREDAJA'
  | 'POTVRDA_PORUKE'
  | 'SINHRONIZACIJA_OFFLINE'
  | 'IZMENA_PRAVILA';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  actionType: AuditActionType;
  details: string;
  reason?: string;
  legalTag?: string;
}

export interface AiAuditReport {
  generatedAt: string;
  mode: 'local-zero-token' | 'gemini-anonymized';
  summary: string;
  anomalies: Array<{
    severity: 'visok' | 'srednji' | 'nizak';
    title: string;
    detail: string;
    affectedEntity: string;
  }>;
  optimizationRecommendations: Array<{
    title: string;
    action: string;
    estimatedBenefit: string;
  }>;
}

export type SyncActionType =
  | 'DRIVER_ADDED'
  | 'VEHICLE_ADDED'
  | 'SHIFT_ASSIGNED'
  | 'DISPATCH_MESSAGE'
  | 'RULE_CONFIG_UPDATED'
  | 'SHIFT_STARTED'
  | 'SHIFT_ENDED'
  | 'TELEMETRY_LOGGED'
  | 'VEHICLE_HANDOVER'
  | 'MESSAGE_ACK';

export interface SyncEvent {
  id: string;
  seq: number;
  originNode: NodeId;
  targetNode: NodeId;
  actionType: SyncActionType;
  createdAt: string;
  payload: Record<string, unknown>;
  deliveryState: 'local_only' | 'gateway_queued' | 'acked';
}

export interface GatewayEnvelopeSummary {
  id: string;
  tenantId: string;
  sourceNode: NodeId;
  targetNode: NodeId;
  seq: number;
  payloadBytes: number;
  cipherPreview: string;
  createdAt: string;
  status: 'queued' | 'acked';
  ackedAt?: string;
}

export interface GatewayTelemetrySnapshot {
  tenantId: string;
  envelopes: GatewayEnvelopeSummary[];
  queuedMobile: number;
  queuedOffice: number;
  ackedRollingCount: number;
  rollingWindowLimit: number;
}

export interface TenantInfo {
  tenantId: string;
  clientName: string;
  pathwayPrefix: string;
  pathwayToken: string;
  status: 'active' | 'suspended';
  createdAt: string;
  isolationMode: 'strict-pathway-token';
  queuedCount?: number;
  ackedCount?: number;
  licenseStatus?: string;
  licenseKey?: string | null;
}

export interface LicenseInfo {
  licenseId: string;
  tenantId: string;
  clientName: string;
  plan: 'Standard' | 'Flota Pro' | 'Enterprise';
  maxDrivers: number;
  modules: string[];
  issuedAt: string;
  expiresAt: string;
  status: 'active' | 'revoked';
  signature: string;
  licenseKey: string;
}

export interface ServerApiLog {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  tenantId: string;
  statusCode: number;
  latencyMs: number;
  payloadBytes: number;
  note: string;
}

export interface ServerDiagnostics {
  timestamp: string;
  nodeVersion: string;
  platform: string;
  uptimeSeconds: number;
  memoryRssMb: number;
  memoryHeapUsedMb: number;
  activeTenants: number;
  activeLicenses: number;
  totalQueuedEnvelopes: number;
  totalAckedEnvelopes: number;
  totalApiLogs: number;
  hasGeminiKey: boolean;
  hmacEngineReady: boolean;
}

export interface NodeLocalData {
  drivers: Driver[];
  shifts: Shift[];
  vehicles: CompanyVehicle[];
  telemetryLogs: TelemetryLog[];
  messages: DispatchMessage[];
  ruleConfig: RuleConfig;
  validationLogs: RuleValidationLog[];
  auditLogs: AuditLogEntry[];
  outbox: SyncEvent[];
  processedEventIds: string[];
  nextSeq: number;
  lastSyncedAt?: string;
}

export interface SystemState {
  activeSegment: SegmentView;
  activeTenantId: string;
  activePathwayToken: string;
  activeMobileDriverId: string;
  desktopStartAccepted: boolean;
  mobileStartAccepted: boolean;
  offlineTunnelMode: boolean;
  officeOfflineMode: boolean;
  rollingWindowSize: number;
  fleetPassphrase: string;
  e2eeLockedOnMobile: boolean;
  mobileNode: NodeLocalData;
  officeNode: NodeLocalData;
  aiAuditReport: AiAuditReport | null;
}
