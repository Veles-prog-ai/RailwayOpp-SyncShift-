import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { apiFetch, apiUrl } from './apiClient';
import { decryptEnvelopePayload, encryptEnvelopePayload } from './crypto';
import {
  calculateShiftDurations,
  evaluateShiftAssignment,
  hasNightHours,
} from './ruleEngine';
import { createInitialSystemState, createTenantNodes } from './seed';

function mobileStorageKey(tenantId) {
  return `zp_live_mobile_v1_${tenantId || 'unconfigured'}`;
}

function officeStorageKey(tenantId) {
  return `zp_live_office_v1_${tenantId || 'unconfigured'}`;
}

const META_STORAGE_KEY = 'zp_live_meta_v1';

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function classifyTelemetry(type) {
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

function normalizeSegmentValue(raw) {
  if (!raw) return null;
  const val = String(raw).trim().toLowerCase();
  if (val === 'landing' || val === 'portal') return 'landing';
  if (val === 'mobile') return 'mobile';
  if (val === 'admin') return 'admin';
  if (val === 'desktop' || val === 'dispatcher') return 'desktop';
  return null;
}

function resolveSegmentFromLocation() {
  if (typeof window !== 'undefined') {
    const pathSeg = normalizeSegmentValue(window.location.pathname.replace(/^\/+|\/+$/g, '').split('/')[0]);
    if (pathSeg) return pathSeg;

    const params = new URLSearchParams(window.location.search);
    const querySeg = normalizeSegmentValue(params.get('segment'));
    if (querySeg) return querySeg;
  }

  // Optional on-demand promotion from terminal (VITE_INSPECT_SEGMENT / INSPECT_SEGMENT)
  const promoted =
    typeof __STUDIO_PROMOTED_SEGMENT__ !== 'undefined'
      ? normalizeSegmentValue(__STUDIO_PROMOTED_SEGMENT__)
      : null;
  if (promoted) return promoted;

  return 'hub';
}

function readUrlBootParams() {
  if (typeof window === 'undefined') {
    return {
      segment: resolveSegmentFromLocation(),
      tenant: null,
      pathway: null,
      driver: null,
      e2ee: null,
      lock: false,
    };
  }
  const params = new URLSearchParams(window.location.search);
  const hashRaw = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(hashRaw);

  const e2eeFromHash = hashParams.get('e2ee');
  const e2eeFromQuery = params.get('e2ee');

  return {
    segment: resolveSegmentFromLocation(),
    tenant: params.get('tenant'),
    pathway: params.get('pathway'),
    driver: params.get('driver'),
    e2ee: e2eeFromHash || e2eeFromQuery,
    lock: params.get('lock') === '1',
  };
}

function enforceRollingWindow(node, limit) {
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

function loadTenantNodes(tenantId) {
  try {
    const mobRaw = localStorage.getItem(mobileStorageKey(tenantId));
    const offRaw = localStorage.getItem(officeStorageKey(tenantId));
    if (mobRaw && offRaw) {
      return {
        mobileNode: JSON.parse(mobRaw),
        officeNode: JSON.parse(offRaw),
      };
    }
  } catch {
    // fallback to clean empty nodes
  }
  return createTenantNodes();
}

function loadInitialState() {
  const boot = readUrlBootParams();
  let meta = {};
  try {
    const raw = localStorage.getItem(META_STORAGE_KEY);
    if (raw) meta = JSON.parse(raw);
  } catch {
    // ignore
  }

  const tenantId =
    boot.tenant || (typeof meta.activeTenantId === 'string' ? meta.activeTenantId : '');
  const pathwayToken =
    boot.pathway ||
    (typeof meta.activePathwayToken === 'string' && !boot.tenant
      ? meta.activePathwayToken
      : '');

  const base = createInitialSystemState(tenantId, pathwayToken);
  const { mobileNode, officeNode } = loadTenantNodes(tenantId);

  const resolvedDriverId =
    (boot.driver && mobileNode.drivers.some((d) => d.id === boot.driver)
      ? boot.driver
      : '') ||
    (typeof meta.activeMobileDriverId === 'string' &&
    !boot.tenant &&
    mobileNode.drivers.some((d) => d.id === meta.activeMobileDriverId)
      ? meta.activeMobileDriverId
      : '') ||
    mobileNode.drivers[0]?.id ||
    '';

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
    ...base,
    activeSegment: boot.segment,
    activeTenantId: tenantId,
    activePathwayToken: pathwayToken,
    activeMobileDriverId: resolvedDriverId,
    desktopStartAccepted: Boolean(meta.desktopStartAccepted),
    mobileStartAccepted: Boolean(meta.mobileStartAccepted),
    offlineTunnelMode: Boolean(meta.offlineTunnelMode),
    officeOfflineMode: Boolean(meta.officeOfflineMode),
    rollingWindowSize:
      typeof meta.rollingWindowSize === 'number'
        ? meta.rollingWindowSize
        : base.rollingWindowSize,
    fleetPassphrase:
      boot.e2ee ||
      (typeof meta.fleetPassphrase === 'string' && !boot.tenant
        ? meta.fleetPassphrase
        : ''),
    e2eeLockedOnMobile: boot.lock,
    mobileNode,
    officeNode,
    aiAuditReport: null,
  };
}

function applyIncomingEventToNode(node, event, isMobileRollingNode, rollingLimit) {
  if (node.processedEventIds.includes(event.id)) {
    return node;
  }

  let next = {
    ...node,
    processedEventIds: [...node.processedEventIds, event.id],
    lastSyncedAt: new Date().toISOString(),
  };

  const p = event.payload;
  const nowIso = new Date().toISOString();

  if (event.actionType === 'DRIVER_ADDED') {
    const drv = p.driver;
    if (!next.drivers.some((d) => d.id === drv.id)) {
      next = { ...next, drivers: [...next.drivers, drv] };
    }
  } else if (event.actionType === 'VEHICLE_ADDED') {
    const veh = p.vehicle;
    if (!next.vehicles.some((v) => v.id === veh.id)) {
      next = { ...next, vehicles: [...next.vehicles, veh] };
    }
  } else if (event.actionType === 'SHIFT_ASSIGNED') {
    const incomingShift = p.shift;
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
    const msg = p.message;
    if (!next.messages.some((m) => m.id === msg.id)) {
      next = { ...next, messages: [msg, ...next.messages] };
    }
  } else if (event.actionType === 'RULE_CONFIG_UPDATED') {
    const cfg = p.config;
    next = { ...next, ruleConfig: cfg };
  } else if (event.actionType === 'SHIFT_STARTED') {
    const shiftId = p.shiftId;
    const logItem = { ...p.telemetry, pendingSync: false, syncedAt: nowIso };
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
    const shiftId = p.shiftId;
    const logItem = { ...p.telemetry, pendingSync: false, syncedAt: nowIso };
    const endStation = p.station;
    const endedAt = p.endedAt;
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
    const logItem = { ...p.telemetry, pendingSync: false, syncedAt: nowIso };
    if (!next.telemetryLogs.some((t) => t.id === logItem.id)) {
      next.telemetryLogs = [logItem, ...next.telemetryLogs];
    }
  } else if (event.actionType === 'VEHICLE_HANDOVER') {
    const vehicleUpdate = p.vehicle;
    const logItem = { ...p.telemetry, pendingSync: false, syncedAt: nowIso };
    const auditItem = p.audit;
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
    const messageId = p.messageId;
    const driverId = p.driverId;
    const ackedAt = p.ackedAt;
    const auditItem = p.audit;
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

const SystemContext = createContext(null);

export function SystemProvider({ children }) {
  const [state, setState] = useState(loadInitialState);
  const [gatewaySnapshot, setGatewaySnapshot] = useState({
    tenantId: state.activeTenantId,
    envelopes: [],
    queuedMobile: 0,
    queuedOffice: 0,
    ackedRollingCount: 0,
    rollingWindowLimit: 20,
  });
  const [syncError, setSyncError] = useState(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const syncLockRef = useRef(false);

  // Dynamically bind PWA manifest link to the active tenant's server-packaged manifest
  useEffect(() => {
    if (!state.activeTenantId) return;
    try {
      let link = document.querySelector('link[rel="manifest"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'manifest';
        document.head.appendChild(link);
      }
      link.href = apiUrl(
        `/api/t/${encodeURIComponent(state.activeTenantId)}/mobile-manifest.webmanifest`
      );
    } catch {
      // ignore DOM manifest errors
    }
  }, [state.activeTenantId]);

  useEffect(() => {
    try {
      localStorage.setItem(
        mobileStorageKey(state.activeTenantId),
        JSON.stringify(state.mobileNode)
      );
      localStorage.setItem(
        officeStorageKey(state.activeTenantId),
        JSON.stringify(state.officeNode)
      );
      localStorage.setItem(
        META_STORAGE_KEY,
        JSON.stringify({
          activeTenantId: state.activeTenantId,
          activePathwayToken: state.activePathwayToken,
          activeMobileDriverId: state.activeMobileDriverId,
          desktopStartAccepted: state.desktopStartAccepted,
          mobileStartAccepted: state.mobileStartAccepted,
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
    const onStorage = (e) => {
      if (!e.newValue) return;
      const curTenant = stateRef.current.activeTenantId;
      try {
        if (e.key === mobileStorageKey(curTenant)) {
          const mobileNode = JSON.parse(e.newValue);
          setState((prev) => ({ ...prev, mobileNode }));
        } else if (e.key === officeStorageKey(curTenant)) {
          const officeNode = JSON.parse(e.newValue);
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
    if (!cur.activeTenantId || !cur.activePathwayToken) {
      setGatewaySnapshot({
        tenantId: '',
        envelopes: [],
        queuedMobile: 0,
        queuedOffice: 0,
        ackedRollingCount: 0,
        rollingWindowLimit: 20,
      });
      return;
    }
    try {
      const resp = await apiFetch(
        `/api/t/${encodeURIComponent(cur.activeTenantId)}/gateway/envelopes`,
        {
          headers: { 'X-Pathway-Token': cur.activePathwayToken },
        }
      );
      if (resp.ok) {
        const data = await resp.json();
        setGatewaySnapshot(data);
        setSyncError((prev) =>
          prev?.includes('Licenca') || prev?.includes('Pathway') || prev?.includes('Nepoznat')
            ? null
            : prev
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
    const curSnapshot = stateRef.current;
    if (
      !curSnapshot.activeTenantId ||
      !curSnapshot.activePathwayToken ||
      !curSnapshot.fleetPassphrase
    ) {
      return;
    }
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
      let gatewayNotice = null;

      // 1. Mobile Outbox -> Encrypted Publish to Tenant Pathway
      if (!cur.offlineTunnelMode && !cur.e2eeLockedOnMobile) {
        const pendingMobile = cur.mobileNode.outbox.filter(
          (e) => e.deliveryState === 'local_only'
        );
        const publishedIds = [];

        for (const ev of pendingMobile) {
          const { iv, ciphertext } = await encryptEnvelopePayload(key, ev);
          const resp = await apiFetch(`${tenantBase}/publish`, {
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
        const publishedIds = [];

        for (const ev of pendingOffice) {
          const { iv, ciphertext } = await encryptEnvelopePayload(key, ev);
          const resp = await apiFetch(`${tenantBase}/publish`, {
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
        const pullResp = await apiFetch(`${tenantBase}/pull?node=office`, {
          headers: { 'X-Pathway-Token': cur.activePathwayToken },
        });
        if (pullResp.ok) {
          const pullData = await pullResp.json();
          const envelopes = pullData.envelopes || [];
          const ackIds = [];
          const decryptedEvents = [];

          for (const env of envelopes) {
            try {
              const ev = await decryptEnvelopePayload(key, env.iv, env.ciphertext);
              decryptedEvents.push(ev);
              ackIds.push(env.id);
            } catch {
              gatewayNotice =
                'Neuspešna E2EE dekripcija na kancelarijskom čvoru — proverite lokalni ključ.';
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
                ackSet.has(o.id) ? { ...o, deliveryState: 'acked' } : o
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

            await apiFetch(`${tenantBase}/ack`, {
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
        const pullResp = await apiFetch(`${tenantBase}/pull?node=mobile`, {
          headers: { 'X-Pathway-Token': cur.activePathwayToken },
        });
        if (pullResp.ok) {
          const pullData = await pullResp.json();
          const envelopes = pullData.envelopes || [];
          const ackIds = [];
          const decryptedEvents = [];

          for (const env of envelopes) {
            try {
              const ev = await decryptEnvelopePayload(key, env.iv, env.ciphertext);
              decryptedEvents.push(ev);
              ackIds.push(env.id);
            } catch {
              gatewayNotice =
                'Neuspešna E2EE dekripcija na mobilnom uređaju — proverite lokalni ključ.';
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
                ackSet.has(o.id) ? { ...o, deliveryState: 'acked' } : o
              );
              const resolvedMobDriver =
                prev.activeMobileDriverId &&
                nextMobile.drivers.some((d) => d.id === prev.activeMobileDriverId)
                  ? prev.activeMobileDriverId
                  : nextMobile.drivers[0]?.id || '';

              return {
                ...prev,
                activeMobileDriverId: resolvedMobDriver,
                mobileNode: nextMobile,
                officeNode: { ...prev.officeNode, outbox: nextOfficeOutbox },
              };
            });

            await apiFetch(`${tenantBase}/ack`, {
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

  const configureConnection = ({ tenantId, pathwayToken, fleetPassphrase }) => {
    const cleanTenant = tenantId.trim();
    const cleanToken = pathwayToken.trim();
    const { mobileNode, officeNode } = loadTenantNodes(cleanTenant);

    setState((prev) => ({
      ...prev,
      activeTenantId: cleanTenant,
      activePathwayToken: cleanToken,
      activeMobileDriverId: mobileNode.drivers[0]?.id || '',
      fleetPassphrase:
        fleetPassphrase !== undefined ? fleetPassphrase.trim() : prev.fleetPassphrase,
      e2eeLockedOnMobile: false,
      mobileNode,
      officeNode,
      aiAuditReport: null,
    }));
  };

  const switchTenant = (tenantId, pathwayToken) => {
    configureConnection({ tenantId, pathwayToken });
  };

  const acceptDesktopStart = () => {
    setState((prev) => ({ ...prev, desktopStartAccepted: true }));
  };

  const acceptMobileStart = () => {
    setState((prev) => ({ ...prev, mobileStartAccepted: true }));
  };

  const reopenStartScreen = (target) => {
    setState((prev) =>
      target === 'desktop'
        ? { ...prev, desktopStartAccepted: false }
        : { ...prev, mobileStartAccepted: false }
    );
  };

  const unlockMobileE2ee = (passphrase) => {
    setState((prev) => ({
      ...prev,
      fleetPassphrase: passphrase.trim(),
      e2eeLockedOnMobile: false,
    }));
  };

  const setActiveMobileDriverId = (driverId) => {
    setState((prev) => ({ ...prev, activeMobileDriverId: driverId }));
  };

  const toggleOfflineTunnelMode = () => {
    setState((prev) => ({ ...prev, offlineTunnelMode: !prev.offlineTunnelMode }));
  };

  const toggleOfficeOfflineMode = () => {
    setState((prev) => ({ ...prev, officeOfflineMode: !prev.officeOfflineMode }));
  };

  const updateFleetPassphrase = (passphrase) => {
    setState((prev) => ({ ...prev, fleetPassphrase: passphrase }));
  };

  const updateRollingWindowSize = (size) => {
    const bounded = Math.max(5, Math.min(100, size));
    setState((prev) => ({
      ...prev,
      rollingWindowSize: bounded,
      mobileNode: enforceRollingWindow(prev.mobileNode, bounded),
    }));
  };

  const addDriver = (input) => {
    setState((prev) => {
      const office = prev.officeNode;
      const nowIso = new Date().toISOString();
      const newDriver = {
        id: uid('drv'),
        name: input.name.trim(),
        licenseCode: input.licenseCode.trim(),
        homeStation: input.homeStation,
        currentStation: input.homeStation,
        status: 'Dostupan',
        lastShiftEndTime: new Date(Date.now() - 24 * 3600000).toISOString(),
        lastShiftEndedAwayFromBase: false,
        phone: input.phone.trim(),
      };

      const syncEvent = {
        id: uid('ev'),
        seq: office.nextSeq,
        originNode: 'office',
        targetNode: 'mobile',
        actionType: 'DRIVER_ADDED',
        createdAt: nowIso,
        payload: { driver: newDriver },
        deliveryState: 'local_only',
      };

      return {
        ...prev,
        activeMobileDriverId: prev.activeMobileDriverId || newDriver.id,
        officeNode: {
          ...office,
          drivers: [...office.drivers, newDriver],
          outbox: [...office.outbox, syncEvent],
          nextSeq: office.nextSeq + 1,
        },
      };
    });
  };

  const addVehicle = (input) => {
    setState((prev) => {
      const office = prev.officeNode;
      const nowIso = new Date().toISOString();
      const newVehicle = {
        id: uid('veh'),
        model: input.model.trim(),
        plate: input.plate.trim().toUpperCase(),
        currentStation: input.currentStation,
        status: 'Parkirano',
        assignedDriverId: null,
        mileageKm: Number(input.mileageKm) || 0,
        nextServiceKm: Number(input.nextServiceKm) || 15000,
        fuelPercent: Math.max(0, Math.min(100, Number(input.fuelPercent) || 100)),
        conditionNote: 'Novo dodato službeno vozilo.',
        equipment: {
          radioStanica: true,
          ključevi: true,
          prsluk: true,
          dokumentacija: true,
        },
        lastHandoverAt: nowIso,
      };

      const syncEvent = {
        id: uid('ev'),
        seq: office.nextSeq,
        originNode: 'office',
        targetNode: 'mobile',
        actionType: 'VEHICLE_ADDED',
        createdAt: nowIso,
        payload: { vehicle: newVehicle },
        deliveryState: 'local_only',
      };

      return {
        ...prev,
        officeNode: {
          ...office,
          vehicles: [...office.vehicles, newVehicle],
          outbox: [...office.outbox, syncEvent],
          nextSeq: office.nextSeq + 1,
        },
      };
    });
  };

  const assignOrReassignShift = (input) => {
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
    const segments = [
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
        startTime: new Date(startMs + (prepH + driveH + waitH) * 3600000).toISOString(),
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

    const newShift = {
      id: shiftId,
      driverId: driver.id,
      clientOperator: input.clientOperator.trim(),
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
      vehicleKmUsed: 0,
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
          ? { ...d, status: 'Vanredno angažovan' }
          : d
      );

      const newAudits = [...curOffice.auditLogs];
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

      const syncEvent = {
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

  const startShiftFromMobile = (shiftId) => {
    setState((prev) => {
      const mob = prev.mobileNode;
      const shift = mob.shifts.find((s) => s.id === shiftId);
      if (!shift) return prev;
      const driver = mob.drivers.find((d) => d.id === shift.driverId);
      const nowIso = new Date().toISOString();

      const logItem = {
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

      const syncEvent = {
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

  const endShiftFromMobile = (shiftId) => {
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

      const logItem = {
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

      const syncEvent = {
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

  const logFieldTelemetry = (input) => {
    setState((prev) => {
      const mob = prev.mobileNode;
      const nowIso = new Date().toISOString();
      const item = {
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

      const syncEvent = {
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

  const submitVehicleHandover = (input) => {
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
          ? 'Servisno upozorenje'
          : input.action === 'PREUZIMANJE'
          ? 'U upotrebi'
          : 'Parkirano';

      const updatedVehicle = {
        ...vehicle,
        currentStation: input.station,
        status: nextStatus,
        assignedDriverId: input.action === 'PREUZIMANJE' ? input.driverId : null,
        mileageKm: input.mileageKm,
        fuelPercent: input.fuelPercent,
        conditionNote: input.conditionNote,
        equipment: input.equipment,
        lastHandoverAt: nowIso,
      };

      const logItem = {
        id: uid('tel'),
        timestamp: nowIso,
        driverId: input.driverId,
        type:
          input.action === 'PREUZIMANJE' ? 'PREUZIMANJE_VOZILA' : 'PREDAJA_VOZILA',
        classification: 'Flota i oprema',
        station: input.station,
        description: `${
          input.action === 'PREUZIMANJE' ? 'Preuzeto' : 'Predato'
        } vozilo ${vehicle.model} (${vehicle.plate}) u stanici ${input.station}. Kilometraža: ${input.mileageKm} km, gorivo: ${input.fuelPercent}%.`,
        pendingSync: true,
      };

      const auditItem = {
        id: uid('aud'),
        timestamp: nowIso,
        actor: driver.name,
        actionType: 'VOZILO_PRIMOPREDAJA',
        details: `${
          input.action === 'PREUZIMANJE' ? 'Preuzimanje' : 'Predaja'
        } vozila ${vehicle.plate} (${input.station}, ${input.mileageKm} km).`,
      };

      const syncEvent = {
        id: uid('ev'),
        seq: mob.nextSeq,
        originNode: 'mobile',
        targetNode: 'office',
        actionType: 'VEHICLE_HANDOVER',
        createdAt: nowIso,
        payload: {
          vehicle: updatedVehicle,
          telemetry: logItem,
          audit: auditItem,
        },
        deliveryState: 'local_only',
      };

      const nextMob = enforceRollingWindow(
        {
          ...mob,
          vehicles: mob.vehicles.map((v) =>
            v.id === input.vehicleId ? updatedVehicle : v
          ),
          telemetryLogs: [logItem, ...mob.telemetryLogs],
          auditLogs: [auditItem, ...mob.auditLogs],
          outbox: [...mob.outbox, syncEvent],
          nextSeq: mob.nextSeq + 1,
        },
        prev.rollingWindowSize
      );

      return { ...prev, mobileNode: nextMob };
    });
  };

  const sendDispatchMessage = (input) => {
    setState((prev) => {
      const office = prev.officeNode;
      const nowIso = new Date().toISOString();
      const newMsg = {
        id: uid('msg'),
        recipientDriverId: input.recipientDriverId,
        senderName: 'Dispečerski centar',
        title: input.title,
        body: input.body,
        priority: input.priority,
        createdAt: nowIso,
        acknowledgedAtByDriver: {},
      };

      const syncEvent = {
        id: uid('ev'),
        seq: office.nextSeq,
        originNode: 'office',
        targetNode: 'mobile',
        actionType: 'DISPATCH_MESSAGE',
        createdAt: nowIso,
        payload: { message: newMsg },
        deliveryState: 'local_only',
      };

      return {
        ...prev,
        officeNode: {
          ...office,
          messages: [newMsg, ...office.messages],
          outbox: [...office.outbox, syncEvent],
          nextSeq: office.nextSeq + 1,
        },
      };
    });
  };

  const acknowledgeMessage = (messageId, driverId) => {
    setState((prev) => {
      const mob = prev.mobileNode;
      const nowIso = new Date().toISOString();
      const drv = mob.drivers.find((d) => d.id === driverId);
      const auditItem = {
        id: uid('aud'),
        timestamp: nowIso,
        actor: drv?.name || driverId,
        actionType: 'POTVRDA_PORUKE',
        details: `Potvrđen prijem dispečerske poruke (${messageId}).`,
      };

      const syncEvent = {
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

  const updateRuleConfig = (config) => {
    setState((prev) => {
      const office = prev.officeNode;
      const nowIso = new Date().toISOString();
      const syncEvent = {
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
              actor: 'Dispečer / Lokalna uprava',
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

  const setAiAuditReport = (report) => {
    setState((prev) => ({ ...prev, aiAuditReport: report }));
  };

  const purgeLocalData = () => {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('zp_') || k.startsWith('zp_live_'))) {
          localStorage.removeItem(k);
        }
      }
    } catch {
      // ignore
    }
    const clean = createInitialSystemState('', '');
    setState((prev) => ({ ...clean, activeSegment: prev.activeSegment }));
    setSyncError(null);
    setGatewaySnapshot({
      tenantId: '',
      envelopes: [],
      queuedMobile: 0,
      queuedOffice: 0,
      ackedRollingCount: 0,
      rollingWindowLimit: 20,
    });
  };

  return (
    <SystemContext.Provider
      value={{
        state,
        gatewaySnapshot,
        syncError,
        switchTenant,
        configureConnection,
        acceptDesktopStart,
        acceptMobileStart,
        reopenStartScreen,
        unlockMobileE2ee,
        setActiveMobileDriverId,
        toggleOfflineTunnelMode,
        toggleOfficeOfflineMode,
        updateFleetPassphrase,
        updateRollingWindowSize,
        triggerGatewaySync,
        addDriver,
        addVehicle,
        assignOrReassignShift,
        startShiftFromMobile,
        endShiftFromMobile,
        logFieldTelemetry,
        submitVehicleHandover,
        sendDispatchMessage,
        acknowledgeMessage,
        updateRuleConfig,
        setAiAuditReport,
        purgeLocalData,
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
