import { NodeLocalData, Shift, ShiftSegment, SystemState } from './types';

function offsetIso(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

function buildSegments(
  shiftId: string,
  startIso: string,
  prepH: number,
  driveH: number,
  waitH: number,
  endH: number
): ShiftSegment[] {
  const startMs = new Date(startIso).getTime();
  const segs: Array<{ type: ShiftSegment['type']; label: string; h: number }> = [
    { type: 'priprema', label: 'Priprema lokomotive i pregled', h: prepH },
    { type: 'upravljanje', label: 'Upravljanje lokomotivom (vuča)', h: driveH },
    { type: 'čekanje_reži', label: 'Čekanje / Reži putovanje', h: waitH },
    { type: 'rasprema', label: 'Rasprema i predaja smene', h: endH },
  ];

  let cursor = startMs;
  return segs.map((seg, idx) => {
    const sIso = new Date(cursor).toISOString();
    cursor += seg.h * 60 * 60 * 1000;
    const eIso = new Date(cursor).toISOString();
    return {
      id: `${shiftId}-seg-${idx + 1}`,
      type: seg.type,
      label: seg.label,
      startTime: sIso,
      endTime: eIso,
      durationHours: seg.h,
    };
  });
}

function createTenantSeedNodeData(tenantId: string): NodeLocalData {
  if (tenantId === 'TENANT-PRIV-B') {
    const s1Start = offsetIso(1.0);
    const s1End = offsetIso(9.5);
    const s2Start = offsetIso(-7.0);
    const s2End = offsetIso(2.0);
    const shifts: Shift[] = [
      {
        id: 'sm-b-201',
        driverId: 'drv-b-1',
        clientOperator: 'Privatni Operater B',
        routeFrom: 'Subotica',
        routeTo: 'Beograd Centar',
        trainNumber: '52410',
        locomotiveCode: '193-905 Vectron',
        startTime: s1Start,
        endTime: s1End,
        segments: buildSegments('sm-b-201', s1Start, 0.5, 6.5, 1.0, 0.5),
        status: 'Planirana',
        isEmergencyOverride: false,
        overtimeClassification: 'Standardno',
        vehicleKmUsed: 186,
        notes: 'Izolovani kanal Privatni Operater B — kontejnerski blok voz.',
      },
      {
        id: 'sm-b-202',
        driverId: 'drv-b-2',
        clientOperator: 'Privatni Operater B',
        routeFrom: 'Beograd Centar',
        routeTo: 'Dimitrovgrad',
        trainNumber: '52904',
        locomotiveCode: '193-911 Vectron',
        startTime: s2Start,
        endTime: s2End,
        segments: buildSegments('sm-b-202', s2Start, 0.5, 7.5, 0.5, 0.5),
        status: 'U toku',
        isEmergencyOverride: false,
        overtimeClassification: 'Standardno',
        vehicleKmUsed: 224,
      },
    ];

    return {
      shifts,
      drivers: [
        {
          id: 'drv-b-1',
          name: 'Stefan Pavlović',
          licenseCode: 'DOZ-PRV-2011',
          homeStation: 'Subotica',
          currentStation: 'Subotica',
          status: 'Dostupan',
          lastShiftEndTime: offsetIso(-15.0),
          lastShiftEndedAwayFromBase: false,
          phone: '+381 63 551 1102',
        },
        {
          id: 'drv-b-2',
          name: 'Goran Nikolić',
          licenseCode: 'DOZ-PRV-2044',
          homeStation: 'Beograd Centar',
          currentStation: 'Niš',
          status: 'Na smeni',
          lastShiftEndTime: offsetIso(-20.0),
          lastShiftEndedAwayFromBase: false,
          phone: '+381 63 551 1108',
        },
      ],
      vehicles: [
        {
          id: 'veh-b-1',
          model: 'VW Caddy',
          plate: 'NS-910-BR',
          currentStation: 'Subotica',
          status: 'Parkirano',
          assignedDriverId: null,
          mileageKm: 64200,
          nextServiceKm: 75000,
          fuelPercent: 90,
          conditionNote: 'Izolovani vozni park klijenta B.',
          equipment: {
            radioStanica: true,
            ključevi: true,
            prsluk: true,
            dokumentacija: true,
          },
          lastHandoverAt: offsetIso(-12.0),
        },
      ],
      telemetryLogs: [
        {
          id: 'tel-b-1',
          timestamp: offsetIso(-7.0),
          driverId: 'drv-b-2',
          shiftId: 'sm-b-202',
          type: 'POČETAK_SMENE',
          classification: 'Redovan rad',
          station: 'Beograd Centar',
          route: 'Beograd Centar – Dimitrovgrad',
          trainNumber: '52904',
          description: 'Preuzet Vectron 193-911 na izolovanom kanalu klijenta B.',
          pendingSync: false,
          syncedAt: offsetIso(-7.0),
        },
      ],
      messages: [
        {
          id: 'msg-b-1',
          recipientDriverId: 'ALL',
          senderName: 'Dispečer Balkan Rail B',
          title: 'Prioritetni prolaz u stanici Subotica',
          body: 'Izolovani kanal klijenta B: granična primopredaja na 2. koloseku.',
          priority: 'Obaveštenje',
          createdAt: offsetIso(-1.0),
          acknowledgedAtByDriver: {},
        },
      ],
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
      lastSyncedAt: new Date().toISOString(),
    };
  }

  const shift1Start = offsetIso(0.5);
  const shift1End = offsetIso(10.0);

  const shift2Start = offsetIso(-8.5);
  const shift2End = offsetIso(1.5);

  const shift3Start = offsetIso(4.0);
  const shift3End = offsetIso(13.5);

  const shift4Start = offsetIso(-17.0);
  const shift4End = offsetIso(-5.5);

  const shift5Start = offsetIso(-15.0);
  const shift5End = offsetIso(-6.0);

  const shifts: Shift[] = [
    {
      id: 'sm-101',
      driverId: 'drv-1',
      clientOperator: 'Srbija Kargo Klijent A',
      routeFrom: 'Beograd Centar',
      routeTo: 'Lapovo',
      trainNumber: '45210',
      locomotiveCode: '441-705',
      startTime: shift1Start,
      endTime: shift1End,
      segments: buildSegments('sm-101', shift1Start, 0.75, 7.0, 1.0, 0.75),
      status: 'Planirana',
      isEmergencyOverride: false,
      overtimeClassification: 'Standardno',
      vehicleKmUsed: 112,
      notes: 'Redovna teretna garnitura, preuzimanje na 4. koloseku.',
    },
    {
      id: 'sm-102',
      driverId: 'drv-3',
      clientOperator: 'Srbija Kargo Klijent A',
      routeFrom: 'Niš',
      routeTo: 'Dimitrovgrad',
      trainNumber: '48104',
      locomotiveCode: '461-118',
      startTime: shift2Start,
      endTime: shift2End,
      segments: buildSegments('sm-102', shift2Start, 0.5, 8.25, 0.75, 0.5),
      status: 'U toku',
      isEmergencyOverride: false,
      overtimeClassification: 'Standardno',
      vehicleKmUsed: 98,
      notes: 'Usporenje zbog radova na deonici Sićevo–Crvena Reka.',
    },
    {
      id: 'sm-103',
      driverId: 'drv-5',
      clientOperator: 'Privatni Operater B',
      routeFrom: 'Subotica',
      routeTo: 'Beograd Centar',
      trainNumber: '52301',
      locomotiveCode: '193-902 Vectron',
      startTime: shift3Start,
      endTime: shift3End,
      segments: buildSegments('sm-103', shift3Start, 0.75, 7.25, 1.0, 0.5),
      status: 'Planirana',
      isEmergencyOverride: false,
      overtimeClassification: 'Noćni rad',
      vehicleKmUsed: 184,
      notes: 'Intermodalni kontejnerski voz iz granične stanice Subotica.',
    },
    {
      id: 'sm-104',
      driverId: 'drv-2',
      clientOperator: 'Privatni Operater B',
      routeFrom: 'Beograd Centar',
      routeTo: 'Lapovo',
      trainNumber: '51908',
      locomotiveCode: '444-019',
      startTime: shift4Start,
      endTime: shift4End,
      segments: buildSegments('sm-104', shift4Start, 0.5, 9.0, 1.5, 0.5),
      status: 'Završena',
      isEmergencyOverride: false,
      overtimeClassification: 'Noćni rad',
      vehicleKmUsed: 118,
    },
    {
      id: 'sm-105',
      driverId: 'drv-4',
      clientOperator: 'Srbija Kargo Klijent A',
      routeFrom: 'Lapovo',
      routeTo: 'Niš',
      trainNumber: '45912',
      locomotiveCode: '461-042',
      startTime: shift5Start,
      endTime: shift5End,
      segments: buildSegments('sm-105', shift5Start, 0.5, 7.0, 1.0, 0.5),
      status: 'Završena',
      isEmergencyOverride: false,
      overtimeClassification: 'Noćni rad',
      vehicleKmUsed: 136,
    },
  ];

  return {
    shifts,
    drivers: [
      {
        id: 'drv-1',
        name: 'Marko Petrović',
        licenseCode: 'DOZ-SRB-1042',
        homeStation: 'Beograd Centar',
        currentStation: 'Beograd Centar',
        status: 'Dostupan',
        lastShiftEndTime: offsetIso(-14.5),
        lastShiftEndedAwayFromBase: false,
        phone: '+381 64 810 2201',
      },
      {
        id: 'drv-2',
        name: 'Nikola Jovanović',
        licenseCode: 'DOZ-SRB-1187',
        homeStation: 'Lapovo',
        currentStation: 'Lapovo',
        status: 'Obavezan odmor',
        lastShiftEndTime: offsetIso(-5.5),
        lastShiftEndedAwayFromBase: false,
        phone: '+381 64 810 2204',
      },
      {
        id: 'drv-3',
        name: 'Dragan Ilić',
        licenseCode: 'DOZ-SRB-0935',
        homeStation: 'Niš',
        currentStation: 'Niš',
        status: 'Na smeni',
        lastShiftEndTime: offsetIso(-22.0),
        lastShiftEndedAwayFromBase: false,
        phone: '+381 64 810 2209',
      },
      {
        id: 'drv-4',
        name: 'Milan Stojanović',
        licenseCode: 'DOZ-SRB-1320',
        homeStation: 'Beograd Centar',
        currentStation: 'Niš',
        status: 'Obavezan odmor',
        lastShiftEndTime: offsetIso(-6.0),
        lastShiftEndedAwayFromBase: true,
        phone: '+381 64 810 2215',
      },
      {
        id: 'drv-5',
        name: 'Ivan Kovačević',
        licenseCode: 'DOZ-SRB-1408',
        homeStation: 'Subotica',
        currentStation: 'Subotica',
        status: 'Dostupan',
        lastShiftEndTime: offsetIso(-16.0),
        lastShiftEndedAwayFromBase: false,
        phone: '+381 64 810 2223',
      },
    ],
    vehicles: [
      {
        id: 'veh-1',
        model: 'Škoda Octavia',
        plate: 'BG-102-ŽS',
        currentStation: 'Beograd Centar',
        status: 'Parkirano',
        assignedDriverId: null,
        mileageKm: 118420,
        nextServiceKm: 120000,
        fuelPercent: 82,
        conditionNote: 'Ispravno, zimske gume postavljene.',
        equipment: {
          radioStanica: true,
          ključevi: true,
          prsluk: true,
          dokumentacija: true,
        },
        lastHandoverAt: offsetIso(-14.2),
      },
      {
        id: 'veh-2',
        model: 'Dacia Duster',
        plate: 'BG-204-ŽS',
        currentStation: 'Lapovo',
        status: 'Servisno upozorenje',
        assignedDriverId: null,
        mileageKm: 149210,
        nextServiceKm: 150000,
        fuelPercent: 35,
        conditionNote:
          'Nagli pad goriva sa 78% na 35% nakon predaje; bliži se veliki servis na 150.000 km.',
        equipment: {
          radioStanica: true,
          ključevi: true,
          prsluk: true,
          dokumentacija: false,
        },
        lastHandoverAt: offsetIso(-5.3),
      },
      {
        id: 'veh-3',
        model: 'Fiat Doblo',
        plate: 'NS-305-ŽS',
        currentStation: 'Niš',
        status: 'U upotrebi',
        assignedDriverId: 'drv-3',
        mileageKm: 94180,
        nextServiceKm: 105000,
        fuelPercent: 64,
        conditionNote: 'Korišćeno za reži prevoz ekipe do ranžirne stanice Crveni Krst.',
        equipment: {
          radioStanica: true,
          ključevi: true,
          prsluk: true,
          dokumentacija: true,
        },
        lastHandoverAt: offsetIso(-8.8),
      },
    ],
    telemetryLogs: [
      {
        id: 'tel-1',
        timestamp: offsetIso(-8.5),
        driverId: 'drv-3',
        shiftId: 'sm-102',
        type: 'POČETAK_SMENE',
        classification: 'Redovan rad',
        station: 'Niš',
        route: 'Niš – Dimitrovgrad',
        trainNumber: '48104',
        description: 'Preuzeta lokomotiva 461-118, probne kočnice u redu.',
        pendingSync: false,
        syncedAt: offsetIso(-8.5),
      },
      {
        id: 'tel-2',
        timestamp: offsetIso(-6.2),
        driverId: 'drv-3',
        shiftId: 'sm-102',
        type: 'ZASTOJ_KVAR',
        classification: 'Zastoj / Tehnički kvar',
        station: 'Niš',
        route: 'Niš – Dimitrovgrad',
        trainNumber: '48104',
        delayMinutes: 38,
        description:
          'Zastoj pred ulaznim signalom Bela Palanka zbog pada napona kontaktne mreže (38 min).',
        pendingSync: false,
        syncedAt: offsetIso(-6.1),
      },
      {
        id: 'tel-3',
        timestamp: offsetIso(-5.5),
        driverId: 'drv-2',
        shiftId: 'sm-104',
        type: 'PREDAJA_VOZILA',
        classification: 'Flota i oprema',
        station: 'Lapovo',
        description:
          'Predata Dacia Duster BG-204-ŽS na parkingu stanice Lapovo. Kilometraža 149.210 km, gorivo 35%.',
        pendingSync: false,
        syncedAt: offsetIso(-5.5),
      },
      {
        id: 'tel-4',
        timestamp: offsetIso(-3.1),
        driverId: 'drv-4',
        shiftId: 'sm-105',
        type: 'ZASTOJ_KVAR',
        classification: 'Zastoj / Tehnički kvar',
        station: 'Niš',
        route: 'Lapovo – Niš',
        trainNumber: '45912',
        delayMinutes: 24,
        description: 'Čekanje ukrštanja u stanici Stalać i ograničenje brzine na deonici Đunis.',
        pendingSync: false,
        syncedAt: offsetIso(-3.1),
      },
    ],
    messages: [
      {
        id: 'msg-1',
        recipientDriverId: 'drv-1',
        senderName: 'Dispečerski centar Beograd',
        title: 'Potvrda trase za voz 45210',
        body: 'Lokomotiva 441-705 je spremna na 4. koloseku stanice Beograd Centar. Potrebna potvrda prijema naloga pre polaska.',
        priority: 'Hitno',
        createdAt: offsetIso(-0.4),
        acknowledgedAtByDriver: {},
      },
      {
        id: 'msg-2',
        recipientDriverId: 'ALL',
        senderName: 'Glavni dispečer',
        title: 'Lagana vožnja na koridoru Niš–Dimitrovgrad',
        body: 'Zbog radova na koloseku između Sićeva i Bele Palanke uvedena je lagana vožnja 30 km/h. Prijavljujte prolazna vremena redovno.',
        priority: 'Obaveštenje',
        createdAt: offsetIso(-2.5),
        acknowledgedAtByDriver: {
          'drv-3': offsetIso(-2.3),
        },
      },
    ],
    ruleConfig: {
      minRestHomeHours: 12,
      minRestAwayHours: 8,
      maxDrivingHours: 10,
      maxTotalShiftHours: 12,
    },
    validationLogs: [
      {
        id: 'val-1',
        timestamp: offsetIso(-1.2),
        actionLabel: 'Planiranje smene sm-101',
        driverId: 'drv-1',
        driverName: 'Marko Petrović',
        shiftId: 'sm-101',
        passed: true,
        overridden: false,
        checks: [
          {
            ruleName: 'Maksimalno trajanje smene',
            passed: true,
            message: 'Ukupna smena 9.5h ≤ dozvoljenih 12h.',
          },
          {
            ruleName: 'Maksimalno upravljanje lokomotivom',
            passed: true,
            message: 'Upravljanje lokomotivom 7h ≤ dozvoljenih 10h.',
          },
          {
            ruleName: 'Obavezan dnevni odmor (u matičnoj stanici)',
            passed: true,
            message: 'Odmor od 15h zadovoljava minimum od 12h (u matičnoj stanici).',
          },
          {
            ruleName: 'Zabrana preklapanja smena',
            passed: true,
            message: 'Nema preklapanja sa drugim dodeljenim smenama.',
          },
        ],
        summaryMessage: 'Sva 4 deterministička pravila zadovoljena za Marko Petrović.',
      },
    ],
    auditLogs: [
      {
        id: 'aud-1',
        timestamp: offsetIso(-5.5),
        actor: 'Nikola Jovanović',
        actionType: 'VOZILO_PRIMOPREDAJA',
        details:
          'Predao Dacia Duster BG-204-ŽS u stanici Lapovo (149.210 km, gorivo 35%).',
      },
      {
        id: 'aud-2',
        timestamp: offsetIso(-2.3),
        actor: 'Dragan Ilić',
        actionType: 'POTVRDA_PORUKE',
        details:
          'Potvrdio prijem obaveštenja: "Lagana vožnja na koridoru Niš–Dimitrovgrad".',
      },
    ],
    outbox: [],
    processedEventIds: [],
    nextSeq: 1,
    lastSyncedAt: new Date().toISOString(),
  };
}

export function createTenantNodes(tenantId: string): {
  mobileNode: NodeLocalData;
  officeNode: NodeLocalData;
} {
  const officeNode = createTenantSeedNodeData(tenantId);
  const mobileNode: NodeLocalData = JSON.parse(JSON.stringify(officeNode));
  return { mobileNode, officeNode };
}

export function createSeedState(
  tenantId = 'TENANT-SRB-A',
  pathwayToken = 'pw_srb_a_91k4x8m2'
): SystemState {
  const { mobileNode, officeNode } = createTenantNodes(tenantId);
  return {
    activeSegment: 'dispatcher',
    activeTenantId: tenantId,
    activePathwayToken: pathwayToken,
    activeMobileDriverId: mobileNode.drivers[0]?.id || 'drv-1',
    offlineTunnelMode: false,
    officeOfflineMode: false,
    rollingWindowSize: 25,
    fleetPassphrase:
      tenantId === 'TENANT-PRIV-B'
        ? 'BALKAN-RAIL-B-KLJUC'
        : 'ZP-PRIVATNI-E2EE-KLJUC',
    e2eeLockedOnMobile: false,
    mobileNode,
    officeNode,
    aiAuditReport: null,
  };
}
