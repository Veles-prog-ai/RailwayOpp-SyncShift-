export function createEmptyNodeData() {
  return {
    drivers: [],
    shifts: [],
    vehicles: [],
    telemetryLogs: [],
    messages: [],
    ruleConfig: {
      minRestHomeHours: 12,
      minRestAwayHours: 8,
      maxDrivingHours: 10,
      maxTotalShiftHours: 12,
    },
    validationLogs: [],
    auditLogs: [],
    outbox: [],
    processedEventIds: [],
    nextSeq: 1,
  };
}

export function createTenantNodes() {
  return {
    mobileNode: createEmptyNodeData(),
    officeNode: createEmptyNodeData(),
  };
}

export function createInitialSystemState(tenantId = '', pathwayToken = '') {
  const { mobileNode, officeNode } = createTenantNodes();

  return {
    activeSegment: 'landing',
    activeTenantId: tenantId,
    activePathwayToken: pathwayToken,
    activeMobileDriverId: '',
    desktopStartAccepted: false,
    mobileStartAccepted: false,
    offlineTunnelMode: false,
    officeOfflineMode: false,
    rollingWindowSize: 25,
    fleetPassphrase: '',
    e2eeLockedOnMobile: false,
    mobileNode,
    officeNode,
    aiAuditReport: null,
  };
}
