import { calculateShiftDurations } from './ruleEngine';

/**
 * Zero-token deterministic local audit that runs entirely on the client's
 * desktop / Docker vault without sending any data externally.
 */
export function runLocalDeterministicAudit(node) {
  const anomalies = [];
  const recommendations = [];

  // 1. Check vehicles for service proximity, low fuel, missing equipment, or sudden fuel drop notes
  for (const v of node.vehicles) {
    const kmLeft = v.nextServiceKm - v.mileageKm;
    if (kmLeft <= 1000) {
      anomalies.push({
        severity: 'visok',
        title: `Servisni prag blizu (${v.plate})`,
        detail: `${v.model} (${v.plate}) je na ${v.mileageKm.toLocaleString('sr-RS')} km — preostalo samo ${kmLeft} km do servisa na ${v.nextServiceKm.toLocaleString('sr-RS')} km.`,
        affectedEntity: `${v.model} ${v.plate}`,
      });
    }
    if (v.fuelPercent <= 35 || v.conditionNote.toLowerCase().includes('pad goriva')) {
      anomalies.push({
        severity: 'srednji',
        title: `Disbalans goriva na vozilu ${v.plate}`,
        detail: `Nivo goriva je ${v.fuelPercent}% u stanici ${v.currentStation}. Napomena: ${v.conditionNote}`,
        affectedEntity: `${v.model} ${v.plate}`,
      });
    }
    if (!v.equipment.dokumentacija || !v.equipment.radioStanica || !v.equipment.ključevi) {
      anomalies.push({
        severity: 'visok',
        title: `Nepotpuna oprema vozila ${v.plate}`,
        detail: `U stanici ${v.currentStation} nedostaje obavezna oprema ili putna dokumentacija u vozilu.`,
        affectedEntity: v.plate,
      });
    }
  }

  // 2. Check corridor delays from telemetry
  const delayLogs = node.telemetryLogs.filter((t) => (t.delayMinutes || 0) >= 20);
  if (delayLogs.length > 0) {
    const totalDelay = delayLogs.reduce((acc, t) => acc + (t.delayMinutes || 0), 0);
    const routes = Array.from(new Set(delayLogs.map((d) => d.route || d.station))).join(', ');
    anomalies.push({
      severity: 'srednji',
      title: 'Ponavljajući zastoji na koridoru',
      detail: `Evidentirano ${delayLogs.length} zastoja ukupnog trajanja ${totalDelay} min na trasama: ${routes}.`,
      affectedEntity: routes,
    });
  }

  // 3. Check shifts approaching 10h driving limit or using Emergency Override
  for (const s of node.shifts) {
    const { drivingHours } = calculateShiftDurations(s.startTime, s.endTime, s.segments);
    if (s.isEmergencyOverride) {
      anomalies.push({
        severity: 'visok',
        title: `Vanredno odobrenje — voz ${s.trainNumber}`,
        detail: `Smena aktivirana mimo redovnog odmora (${s.overtimeClassification}). Razlog: ${s.overrideReason || 'nije naveden'}.`,
        affectedEntity: `Voz ${s.trainNumber}`,
      });
    } else if (drivingHours >= node.ruleConfig.maxDrivingHours - 1.5 && s.status === 'U toku') {
      anomalies.push({
        severity: 'srednji',
        title: `Približavanje limitu vuče (${drivingHours}h/${node.ruleConfig.maxDrivingHours}h)`,
        detail: `Aktivni voz ${s.trainNumber} (${s.routeFrom} → ${s.routeTo}) je blizu maksimalnog dozvoljenog vremena upravljanja.`,
        affectedEntity: `Voz ${s.trainNumber}`,
      });
    }
  }

  // 4. Station fleet & driver balancing recommendations
  const awayDrivers = node.drivers.filter((d) => d.currentStation !== d.homeStation);
  if (awayDrivers.length > 0) {
    const sample = awayDrivers[0];
    const parkedHere = node.vehicles.find(
      (v) => v.currentStation === sample.currentStation && v.status !== 'U upotrebi'
    );
    recommendations.push({
      title: `Povratna rotacija iz stanice ${sample.currentStation}`,
      action: parkedHere
        ? `Upariti mašinovođu ${sample.name} sa vozilom ${parkedHere.plate} ili povratnom trasom ka matičnoj stanici ${sample.homeStation}.`
        : `Planirati reži povratak za ${sample.name} iz ${sample.currentStation} ka matičnoj stanici ${sample.homeStation}.`,
      estimatedBenefit: 'Smanjenje reži troškova i brže pokretanje 12h odmora u bazi.',
    });
  }

  const serviceWarningVeh = node.vehicles.find((v) => v.status === 'Servisno upozorenje');
  if (serviceWarningVeh) {
    const spareVeh = node.vehicles.find(
      (v) => v.id !== serviceWarningVeh.id && v.status === 'Parkirano'
    );
    recommendations.push({
      title: `Preventivni servis (${serviceWarningVeh.currentStation})`,
      action: spareVeh
        ? `Zameniti ${serviceWarningVeh.model} (${serviceWarningVeh.plate}) slobodnim vozilom ${spareVeh.model} (${spareVeh.plate}) iz stanice ${spareVeh.currentStation} i dopuniti opremu.`
        : `Uputiti ${serviceWarningVeh.model} (${serviceWarningVeh.plate}) na redovan servis pre isteka ${serviceWarningVeh.nextServiceKm.toLocaleString('sr-RS')} km.`,
      estimatedBenefit: 'Sprečavanje neplaniranog ispada službenog vozila na koridoru.',
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    mode: 'local-zero-token',
    summary: `Lokalna analiza završena (0 potrošenih AI tokena, 100% privatni podaci): detektovano ${anomalies.length} operativnih upozorenja i ${recommendations.length} predloga rotacije.`,
    anomalies,
    optimizationRecommendations: recommendations,
  };
}

/**
 * Strips driver names & phone numbers before optional Gemini audit.
 */
export function buildAnonymizedAuditPayload(node) {
  const driverAlias = new Map(
    node.drivers.map((d, i) => [d.id, `MASINOVODJA-${String(i + 1).padStart(2, '0')}`])
  );

  return {
    drivers: node.drivers.map((d) => ({
      code: driverAlias.get(d.id),
      homeStation: d.homeStation,
      currentStation: d.currentStation,
      status: d.status,
    })),
    shifts: node.shifts.map((s) => ({
      trainNumber: s.trainNumber,
      driverCode: driverAlias.get(s.driverId),
      client: s.clientOperator,
      route: `${s.routeFrom}->${s.routeTo}`,
      status: s.status,
      override: s.isEmergencyOverride,
      vehicleKm: s.vehicleKmUsed,
    })),
    vehicles: node.vehicles.map((v) => ({
      plate: v.plate,
      station: v.currentStation,
      status: v.status,
      km: v.mileageKm,
      nextServiceKm: v.nextServiceKm,
      fuelPct: v.fuelPercent,
      note: v.conditionNote,
    })),
    delays: node.telemetryLogs
      .filter((t) => (t.delayMinutes || 0) > 0 || t.classification !== 'Redovan rad')
      .slice(0, 15)
      .map((t) => ({
        station: t.station,
        route: t.route,
        delayMin: t.delayMinutes || 0,
        type: t.classification,
        desc: t.description,
      })),
  };
}
