export function hoursBetween(startIso, endIso) {
  if (!startIso || !endIso) return 0;
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return 0;
  }
  const ms = endMs - startMs;
  return Math.max(0, Number((ms / (1000 * 60 * 60)).toFixed(2)));
}

export function getRequiredRestHours(driver, config) {
  if (!driver) return config?.minRestHomeHours ?? 12;
  return driver.lastShiftEndedAwayFromBase
    ? (config?.minRestAwayHours ?? 8)
    : (config?.minRestHomeHours ?? 12);
}

export function getDriverRemainingRestHours(
  driver,
  config,
  referenceIso = new Date().toISOString()
) {
  const required = getRequiredRestHours(driver, config);
  if (!driver || !driver.lastShiftEndTime) {
    return { required, elapsed: required, remaining: 0 };
  }
  const elapsed = hoursBetween(driver.lastShiftEndTime, referenceIso);
  const remaining = Math.max(0, Number((required - elapsed).toFixed(2)));
  return { required, elapsed, remaining };
}

/**
 * Resolves effective operational status for a driver, ensuring that completed
 * mandatory rest automatically resolves back to 'Dostupan'.
 */
export function getDriverEffectiveStatus(
  driver,
  config,
  referenceIso = new Date().toISOString()
) {
  if (!driver) return 'Dostupan';
  if (driver.status === 'Na smeni' || driver.status === 'Vanredno angažovan') {
    return driver.status;
  }
  if (driver.status === 'Obavezan odmor') {
    const { remaining } = getDriverRemainingRestHours(driver, config, referenceIso);
    if (remaining <= 0) {
      return 'Dostupan';
    }
    return 'Obavezan odmor';
  }
  return driver.status || 'Dostupan';
}

export function calculateShiftDurations(startTime, endTime, segments) {
  const totalShiftHours = hoursBetween(startTime, endTime);
  if (segments && segments.length > 0) {
    const drivingHours = Number(
      segments
        .filter((s) => s.type === 'upravljanje')
        .reduce((acc, s) => acc + (Number(s.durationHours) || 0), 0)
        .toFixed(2)
    );
    return {
      drivingHours,
      totalShiftHours,
      isDrivingEstimated: false,
    };
  }
  // If no explicit segments passed, assume 75% of shift is active locomotive driving
  return {
    drivingHours: Number((totalShiftHours * 0.75).toFixed(2)),
    totalShiftHours,
    isDrivingEstimated: true,
  };
}

/**
 * Calculates the exact number of night work minutes (22:00 - 06:00) in the specified time zone.
 */
export function getNightMinutes(startIso, endIso, timeZone = 'Europe/Belgrade') {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return 0;
  }

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  });

  let nightMinutes = 0;
  const ONE_MINUTE_MS = 60 * 1000;

  for (let t = startMs; t < endMs; t += ONE_MINUTE_MS) {
    const hourStr = formatter.format(new Date(t));
    const hour = Number(hourStr) === 24 ? 0 : Number(hourStr);
    if (hour >= 22 || hour < 6) {
      nightMinutes += 1;
    }
  }

  return nightMinutes;
}

export function hasNightHours(startIso, endIso, timeZone = 'Europe/Belgrade') {
  return getNightMinutes(startIso, endIso, timeZone) > 0;
}

export function evaluateShiftAssignment(params) {
  const { driver, candidateShift, existingShifts = [], config } = params;
  const checks = [];

  // 1. Chronological & Total Shift Duration check (max 12h)
  const candStart = new Date(candidateShift.startTime).getTime();
  const candEnd = new Date(candidateShift.endTime).getTime();
  const validChronology =
    !Number.isNaN(candStart) && !Number.isNaN(candEnd) && candEnd > candStart;

  const { drivingHours, totalShiftHours, isDrivingEstimated } = calculateShiftDurations(
    candidateShift.startTime,
    candidateShift.endTime,
    candidateShift.segments
  );

  const totalShiftOk = validChronology && totalShiftHours <= config.maxTotalShiftHours;
  checks.push({
    ruleName: 'Maksimalno trajanje smene',
    passed: totalShiftOk,
    message: !validChronology
      ? 'Vreme završetka smene mora biti posle vremena početka.'
      : totalShiftOk
      ? `Ukupna smena ${totalShiftHours}h ≤ dozvoljenih ${config.maxTotalShiftHours}h.`
      : `PREKORAČENJE: Ukupna smena traje ${totalShiftHours}h (zakonski maksimum ${config.maxTotalShiftHours}h).`,
  });

  // 2. Max Locomotive Driving check (max 10h)
  const drivingOk = drivingHours <= config.maxDrivingHours;
  const estimateNote = isDrivingEstimated ? ' [procena 75% - nisu uneti segmenti]' : '';
  checks.push({
    ruleName: 'Maksimalno upravljanje lokomotivom',
    passed: drivingOk,
    isEstimated: isDrivingEstimated,
    message: drivingOk
      ? `Upravljanje lokomotivom ${drivingHours}h ≤ dozvoljenih ${config.maxDrivingHours}h${estimateNote}.`
      : `PREKORAČENJE: Upravljanje lokomotivom iznosi ${drivingHours}h (zakonski maksimum ${config.maxDrivingHours}h)${estimateNote}.`,
  });

  // 3. Daily Rest check before candidate shift
  // Filter other non-cancelled shifts for this driver in the schedule
  const otherShifts = existingShifts.filter((s) => {
    if (s.driverId !== driver.id) return false;
    if (candidateShift.id && s.id === candidateShift.id) return false;
    if (s.status === 'Otkazana') return false;
    return true;
  });

  // Identify the immediate prior scheduled shift ending at or before candidate shift starts
  const priorShifts = otherShifts
    .filter((s) => new Date(s.endTime).getTime() <= candStart)
    .sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime());

  const immediatePriorShift = priorShifts[0];

  let requiredRestHours;
  let actualRestHours;
  let restTypeLabel;
  let restPassed;
  let restMessage;

  if (immediatePriorShift) {
    const endedAway = immediatePriorShift.routeTo
      ? immediatePriorShift.routeTo !== driver.homeStation
      : false;
    requiredRestHours = endedAway ? config.minRestAwayHours : config.minRestHomeHours;
    actualRestHours = hoursBetween(immediatePriorShift.endTime, candidateShift.startTime);
    restTypeLabel = endedAway ? 'van matične stanice' : 'u matičnoj stanici';
    restPassed = actualRestHours >= requiredRestHours;
    restMessage = restPassed
      ? `Odmor od ${actualRestHours}h nakon prethodne smene (${immediatePriorShift.trainNumber}) zadovoljava minimum od ${requiredRestHours}h (${restTypeLabel}).`
      : `BLOKADA ODMORA: Proteklo samo ${actualRestHours}h od prethodno dodeljene smene (${immediatePriorShift.trainNumber}); zakonski minimum je ${requiredRestHours}h (${restTypeLabel}).`;
  } else if (driver.lastShiftEndTime) {
    const endedAway = Boolean(driver.lastShiftEndedAwayFromBase);
    requiredRestHours = endedAway ? config.minRestAwayHours : config.minRestHomeHours;
    actualRestHours = hoursBetween(driver.lastShiftEndTime, candidateShift.startTime);
    restTypeLabel = endedAway ? 'van matične stanice' : 'u matičnoj stanici';
    restPassed = actualRestHours >= requiredRestHours;
    restMessage = restPassed
      ? `Odmor od ${actualRestHours}h zadovoljava minimum od ${requiredRestHours}h (${restTypeLabel}).`
      : `BLOKADA ODMORA: Proteklo samo ${actualRestHours}h od prethodne smene; zakonski minimum je ${requiredRestHours}h (${restTypeLabel}).`;
  } else {
    // Newly registered driver with no previous shift history
    requiredRestHours = config.minRestHomeHours;
    actualRestHours = config.minRestHomeHours;
    restTypeLabel = 'matična stanica';
    restPassed = true;
    restMessage = 'Novi mašinovođa bez prethodnih smena — obavezni odmor zadovoljen.';
  }

  checks.push({
    ruleName: `Obavezan dnevni odmor (${restTypeLabel})`,
    passed: restPassed,
    message: restMessage,
  });

  // 4. Daily Rest check before subsequent scheduled shift (if present)
  const subsequentShifts = otherShifts
    .filter((s) => new Date(s.startTime).getTime() >= candEnd)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const immediateNextShift = subsequentShifts[0];

  if (immediateNextShift) {
    const candEndsAway = candidateShift.routeTo
      ? candidateShift.routeTo !== driver.homeStation
      : false;
    const requiredRestBeforeNext = candEndsAway
      ? config.minRestAwayHours
      : config.minRestHomeHours;
    const actualRestBeforeNext = hoursBetween(candidateShift.endTime, immediateNextShift.startTime);
    const nextRestTypeLabel = candEndsAway ? 'van matične stanice' : 'u matičnoj stanici';
    const nextRestPassed = actualRestBeforeNext >= requiredRestBeforeNext;

    checks.push({
      ruleName: `Obavezan odmor pre naredne smene (${nextRestTypeLabel})`,
      passed: nextRestPassed,
      message: nextRestPassed
        ? `Odmor od ${actualRestBeforeNext}h do naredne smene (${immediateNextShift.trainNumber}) zadovoljava minimum od ${requiredRestBeforeNext}h.`
        : `BLOKADA ODMORA ZA NAREDNU SMENU: Do sledeće smene (${immediateNextShift.trainNumber}) preostaje samo ${actualRestBeforeNext}h (zakonski minimum ${requiredRestBeforeNext}h ${nextRestTypeLabel}).`,
    });
  }

  // 5. Zero Overlapping Shifts check
  const overlapping = otherShifts.filter((s) => {
    const sStart = new Date(s.startTime).getTime();
    const sEnd = new Date(s.endTime).getTime();
    return candStart < sEnd && candEnd > sStart;
  });

  const hasOverlap = overlapping.length > 0;
  checks.push({
    ruleName: 'Zabrana preklapanja smena',
    passed: !hasOverlap,
    message: !hasOverlap
      ? 'Nema preklapanja sa drugim dodeljenim smenama.'
      : `PREKLAPANJE: Mašinovođa već ima dodeljenu smenu (${overlapping[0].trainNumber}, ${overlapping[0].routeFrom}–${overlapping[0].routeTo}) u istom terminu.`,
  });

  const allowed = checks.every((c) => c.passed);
  const failedRules = checks.filter((c) => !c.passed).map((c) => c.ruleName);

  return {
    allowed,
    checks,
    summaryMessage: allowed
      ? `Sva ${checks.length} deterministička pravila zadovoljena za ${driver.name}.`
      : `Blokirano (${failedRules.join(', ')}) za ${driver.name}.`,
    requiredRestHours,
    actualRestHours,
    drivingHours,
    totalShiftHours,
    isDrivingEstimated,
    hasOverlap,
  };
}

