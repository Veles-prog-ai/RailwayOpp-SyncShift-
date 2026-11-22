import {
  Driver,
  RuleCheckDetail,
  RuleConfig,
  RuleEvaluationResult,
  Shift,
  ShiftSegment,
} from './types';

export function hoursBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, Number((ms / (1000 * 60 * 60)).toFixed(2)));
}

export function getRequiredRestHours(driver: Driver, config: RuleConfig): number {
  return driver.lastShiftEndedAwayFromBase
    ? config.minRestAwayHours
    : config.minRestHomeHours;
}

export function getDriverRemainingRestHours(
  driver: Driver,
  config: RuleConfig,
  referenceIso: string = new Date().toISOString()
): { required: number; elapsed: number; remaining: number } {
  const required = getRequiredRestHours(driver, config);
  const elapsed = hoursBetween(driver.lastShiftEndTime, referenceIso);
  const remaining = Math.max(0, Number((required - elapsed).toFixed(2)));
  return { required, elapsed, remaining };
}

export function calculateShiftDurations(
  startTime: string,
  endTime: string,
  segments?: ShiftSegment[]
): { drivingHours: number; totalShiftHours: number } {
  const totalShiftHours = hoursBetween(startTime, endTime);
  if (segments && segments.length > 0) {
    const drivingHours = Number(
      segments
        .filter((s) => s.type === 'upravljanje')
        .reduce((acc, s) => acc + s.durationHours, 0)
        .toFixed(2)
    );
    return { drivingHours, totalShiftHours };
  }
  // If no explicit segments passed, assume 75% of shift is active locomotive driving
  return {
    drivingHours: Number((totalShiftHours * 0.75).toFixed(2)),
    totalShiftHours,
  };
}

export function hasNightHours(startIso: string, endIso: string): boolean {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const cur = new Date(start);
  while (cur < end) {
    const h = cur.getHours();
    if (h >= 22 || h < 6) {
      return true;
    }
    cur.setHours(cur.getHours() + 1);
  }
  return false;
}

export function evaluateShiftAssignment(params: {
  driver: Driver;
  candidateShift: {
    id?: string;
    startTime: string;
    endTime: string;
    segments?: ShiftSegment[];
  };
  existingShifts: Shift[];
  config: RuleConfig;
}): RuleEvaluationResult {
  const { driver, candidateShift, existingShifts, config } = params;
  const checks: RuleCheckDetail[] = [];

  // 1. Chronological & Total Shift Duration check (max 12h)
  const { drivingHours, totalShiftHours } = calculateShiftDurations(
    candidateShift.startTime,
    candidateShift.endTime,
    candidateShift.segments
  );

  const validChronology =
    new Date(candidateShift.endTime).getTime() >
    new Date(candidateShift.startTime).getTime();

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
  checks.push({
    ruleName: 'Maksimalno upravljanje lokomotivom',
    passed: drivingOk,
    message: drivingOk
      ? `Upravljanje lokomotivom ${drivingHours}h ≤ dozvoljenih ${config.maxDrivingHours}h.`
      : `PREKORAČENJE: Upravljanje lokomotivom iznosi ${drivingHours}h (zakonski maksimum ${config.maxDrivingHours}h).`,
  });

  // 3. Daily Rest check (12h at home base / 8h away from base)
  const requiredRestHours = getRequiredRestHours(driver, config);
  const actualRestHours = hoursBetween(
    driver.lastShiftEndTime,
    candidateShift.startTime
  );
  const restOk = actualRestHours >= requiredRestHours;
  const restTypeLabel = driver.lastShiftEndedAwayFromBase
    ? 'van matične stanice'
    : 'u matičnoj stanici';
  checks.push({
    ruleName: `Obavezan dnevni odmor (${restTypeLabel})`,
    passed: restOk,
    message: restOk
      ? `Odmor od ${actualRestHours}h zadovoljava minimum od ${requiredRestHours}h (${restTypeLabel}).`
      : `BLOKADA ODMORA: Proteklo samo ${actualRestHours}h od prethodne smene; zakonski minimum je ${requiredRestHours}h (${restTypeLabel}).`,
  });

  // 4. Zero Overlapping Shifts check
  const candStart = new Date(candidateShift.startTime).getTime();
  const candEnd = new Date(candidateShift.endTime).getTime();
  const overlapping = existingShifts.filter((s) => {
    if (s.driverId !== driver.id) return false;
    if (candidateShift.id && s.id === candidateShift.id) return false;
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
    hasOverlap,
  };
}
