import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { decryptEnvelopePayload, encryptEnvelopePayload } from './crypto';
import { calculateShiftDurations, evaluateShiftAssignment, hasNightHours } from './ruleEngine';
import { createSeedState, createTenantNodes } from './seed';
import {
  AiAuditReport,
  AuditLogEntry,
  ClientOperator,
  DispatchMessage,
  GatewayTelemetrySnapshot,
  NodeLocalData,
  RuleConfig,
  RuleEvaluationResult,
  SegmentView,
  Shift,
  ShiftSegment,
  StationName,
  SyncEvent,
  SystemState,
  TelemetryClassification,
  TelemetryLog,
  TelemetryType,
  VehicleEquipment,
} from './types';

function mobileStorageKey(tenantId: string) {
  return `zp_node_mobile_v3_${tenantId}`;
}

function officeStorageKey(tenantId: string) {
  return `zp_node_office_v3_${tenantId}`;
}

const META_STORAGE_KEY = 'zp_ui_meta_v4';

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function classifyTelemetry(type: TelemetryType): TelemetryClassification {
  switch (type) {
    case 'ZASTOJ_KVAR':
      return 'Zastoj / Tehnički kvar';
    case 'PAUZA':
      return 'Reži putovanje';
    case 'PREUZIMANJE_VOZILA':
    case 'PREDAJA_VOZILA':
      return 'Flota i oprema';
    default:
      return 'Redovan rad';
  }
}

function readUrlBootParams() {
  if (typeof window === 'undefined') {
    return {
      segment: null as SegmentView | null,
      tenant: null as string | null,
      pathway: null as string | null,
      driver: null as string | null,
      e2ee: null as string | null,
      lock: false,
    };
  }
  const params = new URLSearchParams(window.location.search);
  const hashRaw = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(hashRaw);

  const seg = params.get('segment');
  const e2eeFromHash = hashParams.get('e2ee');
  const e2eeFromQuery = params.get('e2ee');

  return {
    segment:
      seg === 'landing' || seg === 'mobile' || seg === 'admin' || seg === 'dispatcher'
        ? (seg as SegmentView)
        : null,
    tenant: params.get('tenant'),
    pathway: params.get('pathway'),
    driver: params.get('driver'),
    e2ee: e2eeFromHash || e2eeFromQuery,
    lock: params.get('lock') === '1',
  };
}

function enforceRollingWindow(node: NodeLocalData, limit: number): NodeLocalData {
  return {
    ...node,
    telemetryLogs: node.telemetryLogs.slice(0, limit),
    validationLogs: node.validationLogs.slice(0, limit),
    auditLogs: node.auditLogs.slice(0, limit),
    processedEventIds: node.processedEventIds.slice(-100),
    outbox: [
      ...node.outbox.filter((e) => e.deliveryState !== 'acked'),
      ...node.outbox.filter((e) => e.deliveryState === 'acked').slice(-10),
    ],
  };
}

function loadTenantNodes(tenantId: string): {
  mobileNode: NodeLocalData;
  officeNode: NodeLocalData;
} {
  try {
    const mobRaw = localStorage.getItem(mobileStorageKey(tenantId));
    const offRaw = localStorage.getItem(officeStorageKey(tenantId));
    if (mobRaw && offRaw) {
      return {
        mobileNode: JSON.parse(mobRaw) as NodeLocalData,
        officeNode: JSON.parse(offRaw) as NodeLocalData,
      };
    }
  } catch {
    // fallback to tenant seed
  }
  return createTenantNodes(tenantId);
}

function loadInitialState(): SystemState {
  const boot = readUrlBootParams();
  let meta: Record<string, unknown> = {};
  try {
    const raw = localStorage.getItem(META_STORAGE_KEY);
    if (raw) meta = JSON.parse(raw);
  } catch {
    // ignore
  }

  const tenantId =
    boot.tenant ||
    (typeof meta.activeTenantId === 'string' ? meta.activeTenantId : 'TENANT-SRB-A');
  const defaultToken =
    tenantId === 'TENANT-PRIV-B' ? 'pw_priv_b_38m2q7v5' : 'pw_srb_a_91k4x8m2';
  const pathwayToken =
    boot.pathway ||
    (typeof meta.activePathwayToken === 'string' && !boot.tenant
      ? meta.activePathwayToken
      : defaultToken);

  const seed = createSeedState(tenantId, pathwayToken);
  const { mobileNode, officeNode } = loadTenantNodes(tenantId);

  const resolvedDriverId =
    (boot.driver && mobileNode.drivers.some((d) => d.id === boot.driver)
      ? boot.driver
      : null) ||
    (typeof meta.activeMobileDriverId === 'string' &&
    !boot.tenant &&
    mobileNode.drivers.some((d) => d.id === meta.activeMobileDriverId)
      ? meta.activeMobileDriverId
      : null) ||
    mobileNode.drivers[0]?.id ||
    seed.activeMobileDriverId;

  // Strip sensitive #e2ee fragment from the address bar immediately after local ingestion
  if (typeof window !== 'undefined' && (window.location.hash.includes('e2ee=') || boot.e2ee)) {
    try {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('e2ee');
      cleanUrl.hash = '';
      window.history.replaceState({}, '', cleanUrl.toString());
    } catch {
      // ignore
    }
  }

  return {
    activeSegment:
      boot.segment ||
      (meta.activeSegment === 'landing' ||
      meta.activeSegment === 'mobile' ||
      meta.activeSegment === 'admin' ||
      meta.activeSegment === 'dispatcher'
        ? (meta.activeSegment as SegmentView)
        : 'landing'),
    activeTenantId: tenantId,
    activePathwayToken: pathwayToken,
    activeMobileDriverId: resolvedDriverId,
    offlineTunnelMode: Boolean(meta.offlineTunnelMode),
    officeOfflineMode: Boolean(meta.officeOfflineMode),
    rollingWindowSize:
      typeof meta.rollingWindowSize === 'number'
        ? meta.rollingWindowSize
        : seed.rollingWindowSize,
    fleetPassphrase:
      boot.e2ee ||
      (typeof meta.fleetPassphrase === 'string' && !boot.tenant
        ? meta.fleetPassphrase
        : seed.fleetPassphrase),
    e2eeLockedOnMobile: boot.lock,
    mobileNode,
    officeNode,
    aiAuditReport: null,
  };
}

function applyIncomingEventToNode(
  node: NodeLocalData,
  event: SyncEvent,
  isMobileRollingNode: boolean,
  rollingLimit: number
): NodeLocalData {
  if (node.processedEventIds.includes(event.id)) {
    return node;
  }

  let next: NodeLocalData = {
    ...node,
    processedEventIds: [...node.processedEventIds, event.id],
    lastSyncedAt: new Date().toISOString(),
  };

  const p = event.payload;
  const nowIso = new Date().toISOString();

  if (event.actionType === 'SHIFT_ASSIGNED') {
    const incomingShift = p.shift as Shift;
    const drv = next.drivers.find((d) => d.id === incomingShift.driverId);
    const exists = next.shifts.some((s) => s.id === incomingShift.id);
    const nextShifts = exists
      ? next.shifts.map((s) => (s.id === incomingShift.id ? incomingShift : s))
      : [incomingShift, ...next.shifts];

    next = { ...next, shifts: nextShifts };

    if (drv) {
      const evalRes = evaluateShiftAssignment({
        driver: drv,
        candidateShift: incomingShift,
        existingShifts: next.shifts,
        config: next.ruleConfig,
      });
      next.validationLogs = [
        {
          id: uid('val'),
          timestamp: nowIso,
          actionLabel: `Sync smene ${incomingShift.trainNumber}`,
          driverId: drv.id,
          driverName: drv.name,
          shiftId: incomingShift.id,
          passed: evalRes.allowed,
          overridden: incomingShift.isEmergencyOverride,
          overrideReason: incomingShift.overrideReason,
          checks: evalRes.checks,
          summaryMessage: `Lokalna provera (${
            isMobileRollingNode ? 'Mobilni' : 'Kancelarija'
          }): ${evalRes.summaryMessage}`,
        },
        ...next.validationLogs,
      ];
      if (incomingShift.isEmergencyOverride) {
        next.drivers = next.drivers.map((d) =>
          d.id === drv.id ? { ...d, status: 'Vanredno angažovan' } : d
        );
      }
    }
  } else if (event.actionType === 'DISPATCH_MESSAGE') {
    const msg = p.message as DispatchMessage;
    if (!next.messages.some((m) => m.id === msg.id)) {
      next = { ...next, messages: [msg, ...next.messages] };
    }
  } else if (event.actionType === 'RULE_CONFIG_UPDATED') {
    const cfg = p.config as RuleConfig;
    next = { ...next, ruleConfig: cfg };
  } else if (event.actionType === 'SHIFT_STARTED') {
    const shiftId = p.shiftId as string;
    const logItem = { ...(p.telemetry as TelemetryLog), pendingSync: false, syncedAt: nowIso };
    const targetShift = next.shifts.find((s) => s.id === shiftId);
    const drv = targetShift ? next.drivers.find((d) => d.id === targetShift.driverId) : undefined;

    next.shifts = next.shifts.map((s) =>
      s.id === shiftId ? { ...s, status: 'U toku' } : s
    );
    if (drv && targetShift) {
      const evalRes = evaluateShiftAssignment({
        driver: drv,
        candidateShift: targetShift,
        existingShifts: next.shifts,
        config: next.ruleConfig,
      });
      next.validationLogs = [
        {
          id: uid('val'),
          timestamp: nowIso,
          actionLabel: `Početak smene ${targetShift.trainNumber}`,
          driverId: drv.id,
          driverName: drv.name,
          shiftId: targetShift.id,
          passed: evalRes.allowed,
          overridden: targetShift.isEmergencyOverride,
          checks: evalRes.checks,
          summaryMessage: `Gateway sync validacija: ${evalRes.summaryMessage}`,
        },
        ...next.validationLogs,
      ];
      next.drivers = next.drivers.map((d) =>
        d.id === drv.id
          ? { ...d, status: targetShift.isEmergencyOverride ? 'Vanredno angažovan' : 'Na smeni' }
          : d
      );
    }
    if (!next.telemetryLogs.some((t) => t.id === logItem.id)) {
      next.telemetryLogs = [logItem, ...next.telemetryLogs];
    }
  } else if (event.actionType === 'SHIFT_ENDED') {
    const shiftId = p.shiftId as string;
    const logItem = { ...(p.telemetry as TelemetryLog), pendingSync: false, syncedAt: nowIso };
    const endStation = p.station as StationName;
    const endedAt = p.endedAt as string;
    const targetShift = next.shifts.find((s) => s.id === shiftId);

    next.shifts = next.shifts.map((s) =>
      s.id === shiftId ? { ...s, status: 'Završena' } : s
    );
    if (targetShift) {
      next.drivers = next.drivers.map((d) =>
        d.id === targetShift.driverId
          ? {
              ...d,
              status: 'Obavezan odmor',
              currentStation: endStation,
              lastShiftEndTime: endedAt,
              lastShiftEndedAwayFromBase: endStation !== d.homeStation,
            }
          : d
      );
    }
    if (!next.telemetryLogs.some((t) => t.id === logItem.id)) {
      next.telemetryLogs = [logItem, ...next.telemetryLogs];
    }
  } else if (event.actionType === 'TELEMETRY_LOGGED') {
    const logItem = { ...(p.telemetry as TelemetryLog), pendingSync: false, syncedAt: nowIso };
    if (!next.telemetryLogs.some((t) => t.id === logItem.id)) {
      next.telemetryLogs = [logItem, ...next.telemetryLogs];
    }
  } else if (event.actionType === 'VEHICLE_HANDOVER') {
    const vehicleUpdate = p.vehicle as NodeLocalData['vehicles'][number];
    const logItem = { ...(p.telemetry as TelemetryLog), pendingSync: false, syncedAt: nowIso };
    const auditItem = p.audit as AuditLogEntry;
    next.vehicles = next.vehicles.map((v) =>
      v.id === vehicleUpdate.id ? vehicleUpdate : v
    );
    if (!next.telemetryLogs.some((t) => t.id === logItem.id)) {
      next.telemetryLogs = [logItem, ...next.telemetryLogs];
    }
    if (auditItem && !next.auditLogs.some((a) => a.id === auditItem.id)) {
      next.auditLogs = [auditItem, ...next.auditLogs];
    }
  } else if (event.actionType === 'MESSAGE_ACK') {
    const messageId = p.messageId as string;
    const driverId = p.driverId as string;
    const ackedAt = p.ackedAt as string;
    const auditItem = p.audit as AuditLogEntry;
    next.messages = next.messages.map((m) =>
      m.id === messageId
        ? {
            ...m,
            acknowledgedAtByDriver: {
              ...m.acknowledgedAtByDriver,
              [driverId]: ackedAt,
            },
          }
        : m
    );
    if (auditItem && !next.auditLogs.some((a) => a.id === auditItem.id)) {
      next.auditLogs = [auditItem, ...next.auditLogs];
    }
  }

  return isMobileRollingNode ? enforceRollingWindow(next, rollingLimit) : next;
}

export interface CreateOrReassignShiftInput {
  shiftId?: string;
  driverId: string;
  clientOperator: ClientOperator;
  routeFrom: StationName;
  routeTo: StationName;
  trainNumber: string;
  locomotiveCode: string;
  startTime: string;
  endTime: string;
  notes?: string;
  emergencyOverrideReason?: string;
}

export interface VehicleHandoverInput {
  vehicleId: string;
  driverId: string;
  action: 'PREUZIMANJE' | 'PREDAJA';
  station: StationName;
  mileageKm: number;
  fuelPercent: number;
  conditionNote: string;
  equipment: VehicleEquipment;
}

interface SystemContextValue {
  state: SystemState;
  gatewaySnapshot: GatewayTelemetrySnapshot;
  syncError: string | null;
  setActiveSegment: (seg: SegmentView) => void;
  switchTenant: (tenantId: string, pathwayToken: string) => void;
  unlockMobileE2ee: (passphrase: string) => void;
  setActiveMobileDriverId: (driverId: string) => void;
  toggleOfflineTunnelMode: () => void;
  toggleOfficeOfflineMode: () => void;
  updateFleetPassphrase: (passphrase: string) => void;
  updateRollingWindowSize: (size: number) => void;
  triggerGatewaySync: () => Promise<void>;
  assignOrReassignShift: (input: CreateOrReassignShiftInput) => {
    ok: boolean;
    evaluation: RuleEvaluationResult;
  };
  startShiftFromMobile: (shiftId: string) => void;
  endShiftFromMobile: (shiftId: string) => void;
  logFieldTelemetry: (input: {
    driverId: string;
    shiftId?: string;
    type: TelemetryType;
    station: StationName;
    route?: string;
    trainNumber?: string;
    delayMinutes?: number;
    description: string;
  }) => void;
  submitVehicleHandover: (input: VehicleHandoverInput) => void;
  sendDispatchMessage: (input: {
    recipientDriverId: string;
    title: string;
    body: string;
    priority: 'Hitno' | 'Obaveštenje';
  }) => void;
  acknowledgeMessage: (messageId: string, driverId: string) => void;
  updateRuleConfig: (config: RuleConfig) => void;
  setAiAuditReport: (report: AiAuditReport | null) => void;
  resetDemoData: () => void;
}

const SystemContext = createContext<SystemContextValue | null>(null);

export function SystemProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SystemState>(loadInitialState);
  const [gatewaySnapshot, setGatewaySnapshot] = useState<GatewayTelemetrySnapshot>({
    tenantId: state.activeTenantId,
    envelopes: [],
    queuedMobile: 0,
    queuedOffice: 0,
    ackedRollingCount: 0,
    rollingWindowLimit: 20,
  });
  const [syncError, setSyncError] = useState<string | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const syncLockRef = useRef(false);

  // Dynamically bind PWA manifest link to the active tenant's server-packaged manifest
  useEffect(() => {
    try {
      let link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'manifest';
        document.head.appendChild(link);
      }
      link.href = `/api/t/${encodeURIComponent(state.activeTenantId)}/mobile-manifest.webmanifest`;
    } catch {
      // ignore DOM manifest errors
    }
  }, [state.activeTenantId]);

  useEffect(() => {
    try {
      localStorage.setItem(mobileStorageKey(state.activeTenantId), JSON.stringify(state.mobileNode));
      localStorage.setItem(officeStorageKey(state.activeTenantId), JSON.stringify(state.officeNode));
      localStorage.setItem(
        META_STORAGE_KEY,
        JSON.stringify({
          activeSegment: state.activeSegment,
          activeTenantId: state.activeTenantId,
          activePathwayToken: state.activePathwayToken,
          activeMobileDriverId: state.activeMobileDriverId,
          offlineTunnelMode: state.offlineTunnelMode,
          officeOfflineMode: state.officeOfflineMode,
          rollingWindowSize: state.rollingWindowSize,
          fleetPassphrase: state.fleetPassphrase,
        })
      );
    } catch {
      // ignore quota issues
    }
  }, [state]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.newValue) return;
      const curTenant = stateRef.current.activeTenantId;
      try {
        if (e.key === mobileStorageKey(curTenant)) {
          const mobileNode = JSON.parse(e.newValue) as NodeLocalData;
          setState((prev) => ({ ...prev, mobileNode }));
        } else if (e.key === officeStorageKey(curTenant)) {
          const officeNode = JSON.parse(e.newValue) as NodeLocalData;
          setState((prev) => ({ ...prev, officeNode }));
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const refreshGatewaySnapshot = useCallback(async () => {
    const cur = stateRef.current;
    try {
      const resp = await fetch(
        `/api/t/${encodeURIComponent(cur.activeTenantId)}/gateway/envelopes`,
        {
          headers: { 'X-Pathway-Token': cur.activePathwayToken },
        }
      );
      if (resp.ok) {
        const data = (await resp.json()) as GatewayTelemetrySnapshot;
        setGatewaySnapshot(data);
        setSyncError((prev) =>
          prev?.includes('Licenca') || prev?.includes('Pathway') ? null : prev
        );
      } else {
        const errData = await resp.json().catch(() => ({}));
        setSyncError(errData.error || `Gateway odbijen (HTTP ${resp.status}).`);
      }
    } catch {
      // ignore if offline
    }
  }, []);

  const triggerGatewaySync = useCallback(async () => {
    if (syncLockRef.current) return;
    syncLockRef.current = true;

    try {
      const cur = stateRef.current;
      const key = cur.fleetPassphrase;
      const tenantBase = `/api/t/${encodeURIComponent(cur.activeTenantId)}/gateway`;
      const gwHeaders = {
        'Content-Type': 'application/json',
        'X-Pathway-Token': cur.activePathwayToken,
      };
      let gatewayNotice: string | null = null;

      // 1. Mobile Outbox -> Encrypted Publish to Tenant Pathway
      if (!cur.offlineTunnelMode && !cur.e2eeLockedOnMobile) {
        const pendingMobile = cur.mobileNode.outbox.filter(
          (e) => e.deliveryState === 'local_only'
        );
        const publishedIds: string[] = [];

        for (const ev of pendingMobile) {
          const { iv, ciphertext } = await encryptEnvelopePayload(key, ev);
          const resp = await fetch(`${tenantBase}/publish`, {
            method: 'POST',
            headers: gwHeaders,
            body: JSON.stringify({
              id: ev.id,
              sourceNode: 'mobile',
              targetNode: 'office',
              seq: ev.seq,
              iv,
              ciphertext,
              createdAt: ev.createdAt,
            }),
          });
          if (resp.ok) {
            publishedIds.push(ev.id);
          } else {
            const err = await resp.json().catch(() => ({}));
            gatewayNotice = err.error || `Gateway greška (${resp.status}).`;
          }
        }

        if (publishedIds.length > 0) {
          setState((prev) => ({
            ...prev,
            mobileNode: {
              ...prev.mobileNode,
              outbox: prev.mobileNode.outbox.map((e) =>
                publishedIds.includes(e.id)
                  ? { ...e, deliveryState: 'gateway_queued' }
                  : e
              ),
              telemetryLogs: prev.mobileNode.telemetryLogs.map((t) => ({
                ...t,
                pendingSync: false,
                syncedAt: t.syncedAt || new Date().toISOString(),
              })),
            },
          }));
        }
      }

      // 2. Office Outbox -> Encrypted Publish to Tenant Pathway
      if (!cur.officeOfflineMode) {
        const pendingOffice = cur.officeNode.outbox.filter(
          (e) => e.deliveryState === 'local_only'
        );
        const publishedIds: string[] = [];

        for (const ev of pendingOffice) {
          const { iv, ciphertext } = await encryptEnvelopePayload(key, ev);
          const resp = await fetch(`${tenantBase}/publish`, {
            method: 'POST',
            headers: gwHeaders,
            body: JSON.stringify({
              id: ev.id,
              sourceNode: 'office',
              targetNode: 'mobile',
              seq: ev.seq,
              iv,
              ciphertext,
              createdAt: ev.createdAt,
            }),
          });
          if (resp.ok) {
            publishedIds.push(ev.id);
          } else {
            const err = await resp.json().catch(() => ({}));
            gatewayNotice = err.error || `Gateway greška (${resp.status}).`;
          }
        }

        if (publishedIds.length > 0) {
          setState((prev) => ({
            ...prev,
            officeNode: {
              ...prev.officeNode,
              outbox: prev.officeNode.outbox.map((e) =>
                publishedIds.includes(e.id)
                  ? { ...e, deliveryState: 'gateway_queued' }
                  : e
              ),
            },
          }));
        }
      }

      // 3. Office Pull -> Decrypt -> Rule Engine -> ACK
      if (!cur.officeOfflineMode) {
        const pullResp = await fetch(`${tenantBase}/pull?node=office`, {
          headers: { 'X-Pathway-Token': cur.activePathwayToken },
        });
        if (pullResp.ok) {
          const pullData = await pullResp.json();
          const envelopes = pullData.envelopes || [];
          const ackIds: string[] = [];
          const decryptedEvents: SyncEvent[] = [];

          for (const env of envelopes) {
            try {
              const ev = await decryptEnvelopePayload<SyncEvent>(
                key,
                env.iv,
                env.ciphertext
              );
              decryptedEvents.push(ev);
              ackIds.push(env.id);
            } catch {
              gatewayNotice =
                'Neuspešna E2EE dekripcija na kancelarijskom čvoru — proverite ključ flote.';
            }
          }

          if (decryptedEvents.length > 0) {
            setState((prev) => {
              let nextOffice = prev.officeNode;
              for (const ev of decryptedEvents) {
                nextOffice = applyIncomingEventToNode(
                  nextOffice,
                  ev,
                  false,
                  prev.rollingWindowSize
                );
              }
              const ackSet = new Set(ackIds);
              const nextMobileOutbox = prev.mobileNode.outbox.map((o) =>
                ackSet.has(o.id) ? { ...o, deliveryState: 'acked' as const } : o
              );
              return {
                ...prev,
                officeNode: nextOffice,
                mobileNode: enforceRollingWindow(
                  { ...prev.mobileNode, outbox: nextMobileOutbox },
                  prev.rollingWindowSize
                ),
              };
            });

            await fetch(`${tenantBase}/ack`, {
              method: 'POST',
              headers: gwHeaders,
              body: JSON.stringify({ envelopeIds: ackIds, ackedBy: 'office' }),
            });
          }
        } else {
          const err = await pullResp.json().catch(() => ({}));
          gatewayNotice = err.error || `Kanal blokiran (${pullResp.status}).`;
        }
      }

      // 4. Mobile Pull -> Decrypt -> Local Rule Engine -> Rolling Window -> ACK
      if (!cur.offlineTunnelMode && !cur.e2eeLockedOnMobile) {
        const pullResp = await fetch(`${tenantBase}/pull?node=mobile`, {
          headers: { 'X-Pathway-Token': cur.activePathwayToken },
        });
        if (pullResp.ok) {
          const pullData = await pullResp.json();
          const envelopes = pullData.envelopes || [];
          const ackIds: string[] = [];
          const decryptedEvents: SyncEvent[] = [];

          for (const env of envelopes) {
            try {
              const ev = await decryptEnvelopePayload<SyncEvent>(
                key,
                env.iv,
                env.ciphertext
              );
              decryptedEvents.push(ev);
              ackIds.push(env.id);
            } catch {
              gatewayNotice =
                'Neuspešna E2EE dekripcija na mobilnom uređaju — proverite ključ flote.';
            }
          }

          if (decryptedEvents.length > 0) {
            setState((prev) => {
              let nextMobile = prev.mobileNode;
              for (const ev of decryptedEvents) {
                nextMobile = applyIncomingEventToNode(
                  nextMobile,
                  ev,
                  true,
                  prev.rollingWindowSize
                );
              }
              const ackSet = new Set(ackIds);
              const nextOfficeOutbox = prev.officeNode.outbox.map((o) =>
                ackSet.has(o.id) ? { ...o, deliveryState: 'acked' as const } : o
              );
              return {
                ...prev,
                mobileNode: nextMobile,
                officeNode: { ...prev.officeNode, outbox: nextOfficeOutbox },
              };
            });

            await fetch(`${tenantBase}/ack`, {
              method: 'POST',
              headers: gwHeaders,
              body: JSON.stringify({ envelopeIds: ackIds, ackedBy: 'mobile' }),
            });
          }
        } else if (!gatewayNotice) {
          const err = await pullResp.json().catch(() => ({}));
          gatewayNotice = err.error || `Kanal blokiran (${pullResp.status}).`;
        }
      }

      setSyncError(gatewayNotice);
      await refreshGatewaySnapshot();
    } catch {
      setSyncError('Gateway trenutno nije dostupan — čvorovi nastavljaju rad lokalno.');
    } finally {
      syncLockRef.current = false;
    }
  }, [refreshGatewaySnapshot]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void triggerGatewaySync();
    }, 250);
    return () => clearTimeout(timer);
  }, [
    state.activeTenantId,
    state.activePathwayToken,
    state.offlineTunnelMode,
    state.officeOfflineMode,
    state.e2eeLockedOnMobile,
    state.mobileNode.outbox.length,
    state.officeNode.outbox.length,
    state.fleetPassphrase,
    triggerGatewaySync,
  ]);

  useEffect(() => {
    const id = setInterval(() => {
      void triggerGatewaySync();
    }, 3000);
    return () => clearInterval(id);
  }, [triggerGatewaySync]);

  const setActiveSegment = (seg: SegmentView) => {
    setState((prev) => ({ ...prev, activeSegment: seg }));
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('segment', seg);
      window.history.replaceState({}, '', url.toString());
    } catch {
      // ignore
    }
  };

  const switchTenant = (tenantId: string, pathwayToken: string) => {
    const { mobileNode, officeNode } = loadTenantNodes(tenantId);
    const defaultPass =
      tenantId === 'TENANT-PRIV-B'
        ? 'BALKAN-RAIL-B-KLJUC'
        : tenantId === 'TENANT-SRB-A'
        ? 'ZP-PRIVATNI-E2EE-KLJUC'
        : `E2EE-${tenantId}`;

    setState((prev) => ({
      ...prev,
      activeTenantId: tenantId,
      activePathwayToken: pathwayToken,
      activeMobileDriverId: mobileNode.drivers[0]?.id || 'drv-1',
      fleetPassphrase: defaultPass,
      e2eeLockedOnMobile: false,
      mobileNode,
      officeNode,
      aiAuditReport: null,
    }));
  };

  const unlockMobileE2ee = (passphrase: string) => {
    setState((prev) => ({
      ...prev,
      fleetPassphrase: passphrase.trim(),
      e2eeLockedOnMobile: false,
    }));
  };

  const setActiveMobileDriverId = (driverId: string) => {
    setState((prev) => ({ ...prev, activeMobileDriverId: driverId }));
  };

  const toggleOfflineTunnelMode = () => {
    setState((prev) => ({ ...prev, offlineTunnelMode: !prev.offlineTunnelMode }));
  };

  const toggleOfficeOfflineMode = () => {
    setState((prev) => ({ ...prev, officeOfflineMode: !prev.officeOfflineMode }));
  };

  const updateFleetPassphrase = (passphrase: string) => {
    setState((prev) => ({ ...prev, fleetPassphrase: passphrase }));
  };

  const updateRollingWindowSize = (size: number) => {
    const bounded = Math.max(5, Math.min(100, size));
    setState((prev) => ({
      ...prev,
      rollingWindowSize: bounded,
      mobileNode: enforceRollingWindow(prev.mobileNode, bounded),
    }));
  };

  const assignOrReassignShift = (input: CreateOrReassignShiftInput) => {
    const office = state.officeNode;
    const driver = office.drivers.find((d) => d.id === input.driverId);
    if (!driver) {
      return {
        ok: false,
        evaluation: {
          allowed: false,
          checks: [
            {
              ruleName: 'Validacija mašinovođe',
              passed: false,
              message: 'Izabrani mašinovođa nije pronađen.',
            },
          ],
          summaryMessage: 'Greška: mašinovođa nije pronađen.',
          requiredRestHours: 12,
          actualRestHours: 0,
          drivingHours: 0,
          totalShiftHours: 0,
          hasOverlap: false,
        },
      };
    }

    const totalMs =
      new Date(input.endTime).getTime() - new Date(input.startTime).getTime();
    const totalH = Math.max(0.5, Number((totalMs / 3600000).toFixed(2)));
    const prepH = Number(Math.min(0.75, totalH * 0.1).toFixed(2));
    const raspremaH = Number(Math.min(0.5, totalH * 0.08).toFixed(2));
    const waitH = Number(Math.min(1.0, totalH * 0.12).toFixed(2));
    const driveH = Number(Math.max(0.25, totalH - prepH - raspremaH - waitH).toFixed(2));

    const startMs = new Date(input.startTime).getTime();
    const shiftId = input.shiftId || uid('sm');
    const segments: ShiftSegment[] = [
      {
        id: `${shiftId}-seg-1`,
        type: 'priprema',
        label: 'Priprema lokomotive i pregled',
        startTime: new Date(startMs).toISOString(),
        endTime: new Date(startMs + prepH * 3600000).toISOString(),
        durationHours: prepH,
      },
      {
        id: `${shiftId}-seg-2`,
        type: 'upravljanje',
        label: 'Upravljanje lokomotivom (vuča)',
        startTime: new Date(startMs + prepH * 3600000).toISOString(),
        endTime: new Date(startMs + (prepH + driveH) * 3600000).toISOString(),
        durationHours: driveH,
      },
      {
        id: `${shiftId}-seg-3`,
        type: 'čekanje_reži',
        label: 'Čekanje / Reži putovanje',
        startTime: new Date(startMs + (prepH + driveH) * 3600000).toISOString(),
        endTime: new Date(startMs + (prepH + driveH + waitH) * 3600000).toISOString(),
        durationHours: waitH,
      },
      {
        id: `${shiftId}-seg-4`,
        type: 'rasprema',
        label: 'Rasprema i predaja smene',
        startTime: new Date(
          startMs + (prepH + driveH + waitH) * 3600000
        ).toISOString(),
        endTime: new Date(
          startMs + (prepH + driveH + waitH + raspremaH) * 3600000
        ).toISOString(),
        durationHours: raspremaH,
      },
    ];

    const evaluation = evaluateShiftAssignment({
      driver,
      candidateShift: {
        id: input.shiftId,
        startTime: input.startTime,
        endTime: input.endTime,
        segments,
      },
      existingShifts: office.shifts,
      config: office.ruleConfig,
    });

    const nowIso = new Date().toISOString();
    const overrideReason = input.emergencyOverrideReason?.trim();

    if (!evaluation.allowed && !overrideReason) {
      setState((prev) => ({
        ...prev,
        officeNode: {
          ...prev.officeNode,
          validationLogs: [
            {
              id: uid('val'),
              timestamp: nowIso,
              actionLabel: input.shiftId
                ? `Preraspodela smene ${input.trainNumber}`
                : `Nova smena ${input.trainNumber}`,
              driverId: driver.id,
              driverName: driver.name,
              shiftId: input.shiftId,
              passed: false,
              overridden: false,
              checks: evaluation.checks,
              summaryMessage: evaluation.summaryMessage,
            },
            ...prev.officeNode.validationLogs,
          ],
        },
      }));
      return { ok: false, evaluation };
    }

    const isOverridden = !evaluation.allowed && Boolean(overrideReason);
    const night = hasNightHours(input.startTime, input.endTime);

    const newShift: Shift = {
      id: shiftId,
      driverId: driver.id,
      clientOperator: input.clientOperator,
      routeFrom: input.routeFrom,
      routeTo: input.routeTo,
      trainNumber: input.trainNumber,
      locomotiveCode: input.locomotiveCode,
      startTime: input.startTime,
      endTime: input.endTime,
      segments,
      status: 'Planirana',
      isEmergencyOverride: isOverridden,
      overrideReason: isOverridden ? overrideReason : undefined,
      overtimeClassification: isOverridden
        ? 'Vanredni prekovremeni (zakonski uvećano)'
        : night
        ? 'Noćni rad'
        : 'Standardno',
      vehicleKmUsed: 95,
      notes: input.notes,
    };

    setState((prev) => {
      const curOffice = prev.officeNode;
      const exists = curOffice.shifts.some((s) => s.id === shiftId);
      const nextShifts = exists
        ? curOffice.shifts.map((s) => (s.id === shiftId ? newShift : s))
        : [newShift, ...curOffice.shifts];

      const nextDrivers = curOffice.drivers.map((d) =>
        d.id === driver.id && isOverridden
          ? { ...d, status: 'Vanredno angažovan' as const }
          : d
      );

      const newAudits: AuditLogEntry[] = [...curOffice.auditLogs];
      if (isOverridden) {
        newAudits.unshift({
          id: uid('aud'),
          timestamp: nowIso,
          actor: 'Dispečer / Ovlašćeno lice',
          actionType: 'VANREDNO_ODOBRENJE',
          details: `Odobrena smena ${input.trainNumber} (${input.routeFrom}–${input.routeTo}) za ${driver.name} uprkos blokadi pravila.`,
          reason: overrideReason,
          legalTag: 'Vanredni prekovremeni (zakonski uvećano)',
        });
      } else if (input.shiftId) {
        newAudits.unshift({
          id: uid('aud'),
          timestamp: nowIso,
          actor: 'Dispečer',
          actionType: 'PRERASPODELA',
          details: `Preraspoređen voz ${input.trainNumber} (${input.routeFrom}–${input.routeTo}) na mašinovođu ${driver.name}.`,
        });
      }

      const syncEvent: SyncEvent = {
        id: uid('ev'),
        seq: curOffice.nextSeq,
        originNode: 'office',
        targetNode: 'mobile',
        actionType: 'SHIFT_ASSIGNED',
        createdAt: nowIso,
        payload: { shift: newShift },
        deliveryState: 'local_only',
      };

      return {
        ...prev,
        officeNode: {
          ...curOffice,
          shifts: nextShifts,
          drivers: nextDrivers,
          nextSeq: curOffice.nextSeq + 1,
          outbox: [...curOffice.outbox, syncEvent],
          validationLogs: [
            {
              id: uid('val'),
              timestamp: nowIso,
              actionLabel: input.shiftId
                ? `Preraspodela smene ${input.trainNumber}`
                : `Nova smena ${input.trainNumber}`,
              driverId: driver.id,
              driverName: driver.name,
              shiftId,
              passed: evaluation.allowed,
              overridden: isOverridden,
              overrideReason: isOverridden ? overrideReason : undefined,
              checks: evaluation.checks,
              summaryMessage: isOverridden
                ? `VANREDNO ODOBRENJE (Force Majeure): ${evaluation.summaryMessage}`
                : evaluation.summaryMessage,
            },
            ...curOffice.validationLogs,
          ],
          auditLogs: newAudits,
        },
      };
    });

    return { ok: true, evaluation };
  };

  const startShiftFromMobile = (shiftId: string) => {
    setState((prev) => {
      const mob = prev.mobileNode;
      const shift = mob.shifts.find((s) => s.id === shiftId);
      if (!shift) return prev;
      const driver = mob.drivers.find((d) => d.id === shift.driverId);
      const nowIso = new Date().toISOString();

      const logItem: TelemetryLog = {
        id: uid('tel'),
        timestamp: nowIso,
        driverId: shift.driverId,
        shiftId: shift.id,
        type: 'POČETAK_SMENE',
        classification: 'Redovan rad',
        station: shift.routeFrom,
        route: `${shift.routeFrom} – ${shift.routeTo}`,
        trainNumber: shift.trainNumber,
        description: `Mašinovođa započeo smenu na lokomotivi ${shift.locomotiveCode} (voz ${shift.trainNumber}).`,
        pendingSync: true,
      };

      const evalRes = driver
        ? evaluateShiftAssignment({
            driver,
            candidateShift: shift,
            existingShifts: mob.shifts,
            config: mob.ruleConfig,
          })
        : null;

      const syncEvent: SyncEvent = {
        id: uid('ev'),
        seq: mob.nextSeq,
        originNode: 'mobile',
        targetNode: 'office',
        actionType: 'SHIFT_STARTED',
        createdAt: nowIso,
        payload: { shiftId, telemetry: logItem },
        deliveryState: 'local_only',
      };

      const nextMob = enforceRollingWindow(
        {
          ...mob,
          shifts: mob.shifts.map((s) =>
            s.id === shiftId ? { ...s, status: 'U toku' } : s
          ),
          drivers: mob.drivers.map((d) =>
            d.id === shift.driverId
              ? {
                  ...d,
                  status: shift.isEmergencyOverride ? 'Vanredno angažovan' : 'Na smeni',
                }
              : d
          ),
          telemetryLogs: [logItem, ...mob.telemetryLogs],
          validationLogs:
            driver && evalRes
              ? [
                  {
                    id: uid('val'),
                    timestamp: nowIso,
                    actionLabel: `Mobilna provera: Smena ${shift.trainNumber}`,
                    driverId: driver.id,
                    driverName: driver.name,
                    shiftId: shift.id,
                    passed: evalRes.allowed,
                    overridden: shift.isEmergencyOverride,
                    checks: evalRes.checks,
                    summaryMessage: evalRes.summaryMessage,
                  },
                  ...mob.validationLogs,
                ]
              : mob.validationLogs,
          outbox: [...mob.outbox, syncEvent],
          nextSeq: mob.nextSeq + 1,
        },
        prev.rollingWindowSize
      );

      return { ...prev, mobileNode: nextMob };
    });
  };

  const endShiftFromMobile = (shiftId: string) => {
    setState((prev) => {
      const mob = prev.mobileNode;
      const shift = mob.shifts.find((s) => s.id === shiftId);
      if (!shift) return prev;
      const nowIso = new Date().toISOString();
      const { drivingHours, totalShiftHours } = calculateShiftDurations(
        shift.startTime,
        shift.endTime,
        shift.segments
      );

      const logItem: TelemetryLog = {
        id: uid('tel'),
        timestamp: nowIso,
        driverId: shift.driverId,
        shiftId: shift.id,
        type: 'ZAVRŠETAK_SMENE',
        classification: 'Redovan rad',
        station: shift.routeTo,
        route: `${shift.routeFrom} – ${shift.routeTo}`,
        trainNumber: shift.trainNumber,
        description: `Smena završena u stanici ${shift.routeTo}. Upravljanje: ${drivingHours}h, ukupno: ${totalShiftHours}h.`,
        pendingSync: true,
      };

      const syncEvent: SyncEvent = {
        id: uid('ev'),
        seq: mob.nextSeq,
        originNode: 'mobile',
        targetNode: 'office',
        actionType: 'SHIFT_ENDED',
        createdAt: nowIso,
        payload: {
          shiftId,
          station: shift.routeTo,
          endedAt: nowIso,
          telemetry: logItem,
        },
        deliveryState: 'local_only',
      };

      const nextMob = enforceRollingWindow(
        {
          ...mob,
          shifts: mob.shifts.map((s) =>
            s.id === shiftId ? { ...s, status: 'Završena' } : s
          ),
          drivers: mob.drivers.map((d) =>
            d.id === shift.driverId
              ? {
                  ...d,
                  status: 'Obavezan odmor',
                  currentStation: shift.routeTo,
                  lastShiftEndTime: nowIso,
                  lastShiftEndedAwayFromBase: shift.routeTo !== d.homeStation,
                }
              : d
          ),
          telemetryLogs: [logItem, ...mob.telemetryLogs],
          outbox: [...mob.outbox, syncEvent],
          nextSeq: mob.nextSeq + 1,
        },
        prev.rollingWindowSize
      );

      return { ...prev, mobileNode: nextMob };
    });
  };

  const logFieldTelemetry: SystemContextValue['logFieldTelemetry'] = (input) => {
    setState((prev) => {
      const mob = prev.mobileNode;
      const nowIso = new Date().toISOString();
      const item: TelemetryLog = {
        id: uid('tel'),
        timestamp: nowIso,
        driverId: input.driverId,
        shiftId: input.shiftId,
        type: input.type,
        classification: classifyTelemetry(input.type),
        station: input.station,
        route: input.route,
        trainNumber: input.trainNumber,
        delayMinutes: input.delayMinutes,
        description: input.description,
        pendingSync: true,
      };

      const syncEvent: SyncEvent = {
        id: uid('ev'),
        seq: mob.nextSeq,
        originNode: 'mobile',
        targetNode: 'office',
        actionType: 'TELEMETRY_LOGGED',
        createdAt: nowIso,
        payload: { telemetry: item },
        deliveryState: 'local_only',
      };

      const nextMob = enforceRollingWindow(
        {
          ...mob,
          telemetryLogs: [item, ...mob.telemetryLogs],
          outbox: [...mob.outbox, syncEvent],
          nextSeq: mob.nextSeq + 1,
        },
        prev.rollingWindowSize
      );

      return { ...prev, mobileNode: nextMob };
    });
  };

  const submitVehicleHandover = (input: VehicleHandoverInput) => {
    setState((prev) => {
      const mob = prev.mobileNode;
      const nowIso = new Date().toISOString();
      const vehicle = mob.vehicles.find((v) => v.id === input.vehicleId);
      const driver = mob.drivers.find((d) => d.id === input.driverId);
      if (!vehicle || !driver) return prev;

      const missingEquip =
        !input.equipment.radioStanica ||
        !input.equipment.ključevi ||
        !input.equipment.prsluk ||
        !input.equipment.dokumentacija;

      const nearService = input.mileageKm >= vehicle.nextServiceKm - 1000;
      const lowFuel = input.fuelPercent <= 20;
      const hasDamage =
        input.conditionNote.toLowerCase().includes('ošteć') ||
        input.conditionNote.toLowerCase().includes('kvar') ||
        input.conditionNote.toLowerCase().includes('problem');

      const nextStatus =
        nearService || lowFuel || missingEquip || hasDamage
          ? ('Servisno upozorenje' as const)
          : input.action === 'PREUZIMANJE'
          ? ('U upotrebi' as const)
          : ('Parkirano' as const);

      const updatedVehicle = {
        ...vehicle,
        currentStation: input.station,
        mileageKm: input.mileageKm,
        fuelPercent: input.fuelPercent,
        conditionNote: input.conditionNote,
        equipment: input.equipment,
        assignedDriverId: input.action === 'PREUZIMANJE' ? driver.id : null,
        status: nextStatus,
        lastHandoverAt: nowIso,
      };

      const type: TelemetryType =
        input.action === 'PREUZIMANJE' ? 'PREUZIMANJE_VOZILA' : 'PREDAJA_VOZILA';

      const telItem: TelemetryLog = {
        id: uid('tel'),
        timestamp: nowIso,
        driverId: driver.id,
        type,
        classification: 'Flota i oprema',
        station: input.station,
        description: `${
          input.action === 'PREUZIMANJE' ? 'Preuzeo' : 'Predao'
        } ${vehicle.model} (${vehicle.plate}) u stanici ${
          input.station
        }. Kilometraža: ${input.mileageKm.toLocaleString('sr-RS')} km, gorivo: ${
          input.fuelPercent
        }%. ${input.conditionNote}`,
        pendingSync: true,
      };

      const auditItem: AuditLogEntry = {
        id: uid('aud'),
        timestamp: nowIso,
        actor: driver.name,
        actionType: 'VOZILO_PRIMOPREDAJA',
        details: `${
          input.action === 'PREUZIMANJE' ? 'Preuzeo' : 'Predao'
        } ${vehicle.model} ${vehicle.plate} u stanici ${
          input.station
        } (${input.mileageKm.toLocaleString('sr-RS')} km, ${input.fuelPercent}% goriva).`,
      };

      const syncEvent: SyncEvent = {
        id: uid('ev'),
        seq: mob.nextSeq,
        originNode: 'mobile',
        targetNode: 'office',
        actionType: 'VEHICLE_HANDOVER',
        createdAt: nowIso,
        payload: {
          vehicle: updatedVehicle,
          telemetry: telItem,
          audit: auditItem,
        },
        deliveryState: 'local_only',
      };

      const nextMob = enforceRollingWindow(
        {
          ...mob,
          vehicles: mob.vehicles.map((v) =>
            v.id === vehicle.id ? updatedVehicle : v
          ),
          telemetryLogs: [telItem, ...mob.telemetryLogs],
          auditLogs: [auditItem, ...mob.auditLogs],
          outbox: [...mob.outbox, syncEvent],
          nextSeq: mob.nextSeq + 1,
        },
        prev.rollingWindowSize
      );

      return { ...prev, mobileNode: nextMob };
    });
  };

  const sendDispatchMessage: SystemContextValue['sendDispatchMessage'] = (input) => {
    setState((prev) => {
      const office = prev.officeNode;
      const nowIso = new Date().toISOString();
      const msg: DispatchMessage = {
        id: uid('msg'),
        recipientDriverId: input.recipientDriverId,
        senderName: 'Dispečerski centar',
        title: input.title,
        body: input.body,
        priority: input.priority,
        createdAt: nowIso,
        acknowledgedAtByDriver: {},
      };

      const syncEvent: SyncEvent = {
        id: uid('ev'),
        seq: office.nextSeq,
        originNode: 'office',
        targetNode: 'mobile',
        actionType: 'DISPATCH_MESSAGE',
        createdAt: nowIso,
        payload: { message: msg },
        deliveryState: 'local_only',
      };

      return {
        ...prev,
        officeNode: {
          ...office,
          messages: [msg, ...office.messages],
          outbox: [...office.outbox, syncEvent],
          nextSeq: office.nextSeq + 1,
        },
      };
    });
  };

  const acknowledgeMessage = (messageId: string, driverId: string) => {
    setState((prev) => {
      const mob = prev.mobileNode;
      const nowIso = new Date().toISOString();
      const driver = mob.drivers.find((d) => d.id === driverId);
      const msg = mob.messages.find((m) => m.id === messageId);
      if (!msg || msg.acknowledgedAtByDriver[driverId]) return prev;

      const auditItem: AuditLogEntry = {
        id: uid('aud'),
        timestamp: nowIso,
        actor: driver?.name ?? driverId,
        actionType: 'POTVRDA_PORUKE',
        details: `Potvrdio prijem poruke (Read Receipt): "${msg.title}".`,
      };

      const syncEvent: SyncEvent = {
        id: uid('ev'),
        seq: mob.nextSeq,
        originNode: 'mobile',
        targetNode: 'office',
        actionType: 'MESSAGE_ACK',
        createdAt: nowIso,
        payload: { messageId, driverId, ackedAt: nowIso, audit: auditItem },
        deliveryState: 'local_only',
      };

      const nextMob = enforceRollingWindow(
        {
          ...mob,
          messages: mob.messages.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  acknowledgedAtByDriver: {
                    ...m.acknowledgedAtByDriver,
                    [driverId]: nowIso,
                  },
                }
              : m
          ),
          auditLogs: [auditItem, ...mob.auditLogs],
          outbox: [...mob.outbox, syncEvent],
          nextSeq: mob.nextSeq + 1,
        },
        prev.rollingWindowSize
      );

      return { ...prev, mobileNode: nextMob };
    });
  };

  const updateRuleConfig = (config: RuleConfig) => {
    setState((prev) => {
      const office = prev.officeNode;
      const nowIso = new Date().toISOString();
      const syncEvent: SyncEvent = {
        id: uid('ev'),
        seq: office.nextSeq,
        originNode: 'office',
        targetNode: 'mobile',
        actionType: 'RULE_CONFIG_UPDATED',
        createdAt: nowIso,
        payload: { config },
        deliveryState: 'local_only',
      };

      return {
        ...prev,
        officeNode: {
          ...office,
          ruleConfig: config,
          auditLogs: [
            {
              id: uid('aud'),
              timestamp: nowIso,
              actor: 'Administrator sistema',
              actionType: 'IZMENA_PRAVILA',
              details: `Ažurirani pragovi: odmor baza ${config.minRestHomeHours}h, van baze ${config.minRestAwayHours}h, max vožnja ${config.maxDrivingHours}h, max smena ${config.maxTotalShiftHours}h.`,
            },
            ...office.auditLogs,
          ],
          outbox: [...office.outbox, syncEvent],
          nextSeq: office.nextSeq + 1,
        },
      };
    });
  };

  const setAiAuditReport = (report: AiAuditReport | null) => {
    setState((prev) => ({ ...prev, aiAuditReport: report }));
  };

  const resetDemoData = () => {
    localStorage.removeItem(mobileStorageKey('TENANT-SRB-A'));
    localStorage.removeItem(officeStorageKey('TENANT-SRB-A'));
    localStorage.removeItem(mobileStorageKey('TENANT-PRIV-B'));
    localStorage.removeItem(officeStorageKey('TENANT-PRIV-B'));
    const fresh = createSeedState('TENANT-SRB-A', 'pw_srb_a_91k4x8m2');
    setState((prev) => ({ ...fresh, activeSegment: prev.activeSegment }));
    void fetch('/api/gateway/reset', { method: 'POST' }).then(() =>
      refreshGatewaySnapshot()
    );
  };

  return (
    <SystemContext.Provider
      value={{
        state,
        gatewaySnapshot,
        syncError,
        setActiveSegment,
        switchTenant,
        unlockMobileE2ee,
        setActiveMobileDriverId,
        toggleOfflineTunnelMode,
        toggleOfficeOfflineMode,
        updateFleetPassphrase,
        updateRollingWindowSize,
        triggerGatewaySync,
        assignOrReassignShift,
        startShiftFromMobile,
        endShiftFromMobile,
        logFieldTelemetry,
        submitVehicleHandover,
        sendDispatchMessage,
        acknowledgeMessage,
        updateRuleConfig,
        setAiAuditReport,
        resetDemoData,
      }}
    >
      {children}
    </SystemContext.Provider>
  );
}

export function useSystem() {
  const ctx = useContext(SystemContext);
  if (!ctx) {
    throw new Error('useSystem mora biti korišćen unutar SystemProvider-a');
  }
  return ctx;
}
