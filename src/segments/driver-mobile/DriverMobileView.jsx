import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  Car,
  CheckCircle2,
  KeyRound,
  Lock,
  MessageSquare,
  Navigation,
  PauseCircle,
  Play,
  Square,
  TrainFront,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { PWAInstallButton } from '../../components/PWAInstallButton';
import { StartScreen } from '../../components/StartScreen';
import {
  evaluateShiftAssignment,
  getDriverRemainingRestHours,
} from '../../core/ruleEngine';
import { useSystem } from '../../core/store';
import { formatDateTimeSr, formatHours, formatTimeSr, STATIONS } from '../../core/utils';

export const DriverMobileView = () => {
  const {
    state,
    syncError,
    configureConnection,
    acceptMobileStart,
    reopenStartScreen,
    unlockMobileE2ee,
    setActiveMobileDriverId,
    toggleOfflineTunnelMode,
    startShiftFromMobile,
    endShiftFromMobile,
    logFieldTelemetry,
    submitVehicleHandover,
    acknowledgeMessage,
  } = useSystem();

  const mob = state.mobileNode;
  const [tab, setTab] = useState('shifts');
  const [nowTick, setNowTick] = useState(() => new Date().toISOString());
  const [e2eeInput, setE2eeInput] = useState('');

  useEffect(() => {
    const id = setInterval(() => setNowTick(new Date().toISOString()), 30000);
    return () => clearInterval(id);
  }, []);

  const driver =
    mob.drivers.find((d) => d.id === state.activeMobileDriverId) || mob.drivers[0];

  const driverShifts = driver ? mob.shifts.filter((s) => s.driverId === driver.id) : [];
  const activeShift = driverShifts.find((s) => s.status === 'U toku');
  const nextShift = driverShifts.find((s) => s.status === 'Planirana');
  const focusShift = activeShift || nextShift;

  const restInfo = driver
    ? getDriverRemainingRestHours(driver, mob.ruleConfig, nowTick)
    : { elapsed: 0, required: mob.ruleConfig.minRestHomeHours, remaining: 0 };

  const localPendingCount = mob.outbox.filter(
    (e) => e.deliveryState === 'local_only'
  ).length;
  const waitingAckCount = mob.outbox.filter(
    (e) => e.deliveryState === 'gateway_queued'
  ).length;

  const [logStation, setLogStation] = useState(
    driver?.currentStation || 'Beograd Centar'
  );
  const [logRoute, setLogRoute] = useState(
    focusShift ? `${focusShift.routeFrom} – ${focusShift.routeTo}` : ''
  );
  const [logTrain, setLogTrain] = useState(focusShift?.trainNumber || '');
  const [delayMinutes, setDelayMinutes] = useState(20);
  const [logNote, setLogNote] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState(null);

  const [selectedVehicleId, setSelectedVehicleId] = useState(
    (driver && mob.vehicles.find((v) => v.assignedDriverId === driver.id)?.id) ||
      mob.vehicles[0]?.id ||
      ''
  );
  const selectedVehicle = mob.vehicles.find((v) => v.id === selectedVehicleId);
  const [handoverAction, setHandoverAction] = useState('PREDAJA');
  const [handoverStation, setHandoverStation] = useState(
    selectedVehicle?.currentStation || driver?.currentStation || 'Beograd Centar'
  );
  const [mileageKm, setMileageKm] = useState(selectedVehicle?.mileageKm || 0);
  const [fuelPercent, setFuelPercent] = useState(selectedVehicle?.fuelPercent || 100);
  const [conditionNote, setConditionNote] = useState('Bez novih oštećenja, redovno stanje.');
  const [equipment, setEquipment] = useState(
    selectedVehicle?.equipment || {
      radioStanica: true,
      ključevi: true,
      prsluk: true,
      dokumentacija: true,
    }
  );

  useEffect(() => {
    if (selectedVehicle && driver) {
      setHandoverStation(selectedVehicle.currentStation);
      setMileageKm(selectedVehicle.mileageKm);
      setFuelPercent(selectedVehicle.fuelPercent);
      setEquipment(selectedVehicle.equipment);
      setHandoverAction(selectedVehicle.assignedDriverId === driver.id ? 'PREDAJA' : 'PREUZIMANJE');
    }
  }, [selectedVehicleId, driver?.id, selectedVehicle]);

  useEffect(() => {
    if (!selectedVehicleId && mob.vehicles[0]?.id) {
      setSelectedVehicleId(mob.vehicles[0].id);
    }
  }, [mob.vehicles, selectedVehicleId]);

  useEffect(() => {
    if (driver) {
      setLogStation(driver.currentStation);
    }
    if (focusShift) {
      setLogRoute(`${focusShift.routeFrom} – ${focusShift.routeTo}`);
      setLogTrain(focusShift.trainNumber);
    }
  }, [driver?.id, focusShift?.id]);

  const driverMessages = driver
    ? mob.messages.filter(
        (m) => m.recipientDriverId === 'ALL' || m.recipientDriverId === driver.id
      )
    : [];
  const unreadCount = driver
    ? driverMessages.filter((m) => !m.acknowledgedAtByDriver[driver.id]).length
    : 0;

  const showToast = (msg) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3200);
  };

  const handleQuickLog = (type, defaultDesc, delay) => {
    if (!driver) return;
    logFieldTelemetry({
      driverId: driver.id,
      shiftId: focusShift?.id,
      type,
      station: logStation,
      route: logRoute,
      trainNumber: logTrain,
      delayMinutes: delay,
      description: logNote.trim() || defaultDesc,
    });
    setLogNote('');
    showToast(
      state.offlineTunnelMode
        ? 'Sačuvano lokalno (Store-and-Forward čeka signal)'
        : 'Šifrovano (AES-GCM) i poslato na izolovani kanal'
    );
  };

  const handleHandoverSubmit = (e) => {
    e.preventDefault();
    if (!selectedVehicle || !driver) return;
    submitVehicleHandover({
      vehicleId: selectedVehicle.id,
      driverId: driver.id,
      action: handoverAction,
      station: handoverStation,
      mileageKm,
      fuelPercent,
      conditionNote,
      equipment,
    });
    showToast(
      state.offlineTunnelMode
        ? 'Primopredaja sačuvana lokalno (čeka signal)'
        : 'Primopredaja šifrovana i poslata na Gateway'
    );
  };

  const recentDriverLogs = driver
    ? mob.telemetryLogs.filter((t) => t.driverId === driver.id).slice(0, 5)
    : [];

  const localRulePreview =
    focusShift && driver
      ? evaluateShiftAssignment({
          driver,
          candidateShift: focusShift,
          existingShifts: mob.shifts,
          config: mob.ruleConfig,
        })
      : null;

  return (
    <div className="min-h-screen bg-slate-950/95 py-0 sm:py-6 px-0 sm:px-4 flex justify-center items-start">
      <div className="w-full sm:w-[390px] min-h-screen sm:min-h-[780px] sm:max-h-[840px] bg-slate-950 text-slate-100 sm:rounded-[32px] sm:border sm:border-slate-800 sm:shadow-2xl flex flex-col overflow-hidden relative">
        {!state.mobileStartAccepted ? (
          <StartScreen
            mode="mobile"
            tenantId={state.activeTenantId}
            pathwayToken={state.activePathwayToken}
            fleetPassphrase={state.fleetPassphrase}
            onConfirmAndStart={(cfg) => {
              if (cfg.tenantId && cfg.pathwayToken) {
                configureConnection(cfg);
              } else if (cfg.fleetPassphrase) {
                unlockMobileE2ee(cfg.fleetPassphrase);
              }
              acceptMobileStart();
            }}
          />
        ) : (
          <>
            <header className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <label htmlFor="cab-driver-select" className="sr-only">
                    Aktivni mašinovođa
                  </label>
                  <select
                    id="cab-driver-select"
                    value={driver?.id || ''}
                    disabled={mob.drivers.length === 0}
                    onChange={(e) => setActiveMobileDriverId(e.target.value)}
                    className="w-full bg-slate-800 text-slate-100 text-sm font-semibold rounded-lg px-2.5 py-2 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {mob.drivers.length === 0 ? (
                      <option value="">Čeka se profil mašinovođe</option>
                    ) : (
                      mob.drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.currentStation})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => reopenStartScreen('mobile')}
                  title="Politika privatnosti i uputstvo"
                  className="min-h-[40px] px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <BookOpen className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={toggleOfflineTunnelMode}
                  className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    state.offlineTunnelMode
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                      : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
                  }`}
                  title="Simulacija gubitka signala u tunelu"
                >
                  {state.offlineTunnelMode ? (
                    <>
                      <WifiOff className="w-4 h-4" />
                      <span>Tunel (Offline)</span>
                    </>
                  ) : (
                    <>
                      <Wifi className="w-4 h-4" />
                      <span>Online</span>
                    </>
                  )}
                </button>
              </div>

              {/* Client Pathway + Store-and-Forward + Rolling Window */}
              <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-[11px] text-slate-300">
                <span className="flex items-center gap-1 text-emerald-400 font-mono truncate max-w-[140px]">
                  <Lock className="w-3 h-3 shrink-0" />
                  <span className="truncate">{state.activeTenantId || 'Nije povezan'}</span>
                </span>
                <span className="font-mono">
                  Prozor: {mob.telemetryLogs.length}/{state.rollingWindowSize}
                </span>
                <span
                  className={`font-mono font-semibold ${
                    localPendingCount > 0 || waitingAckCount > 0
                      ? 'text-amber-300'
                      : 'text-slate-400'
                  }`}
                >
                  {localPendingCount > 0
                    ? `Lokalno: ${localPendingCount}`
                    : waitingAckCount > 0
                    ? `Čeka ACK: ${waitingAckCount}`
                    : 'ACK OK'}
                </span>
              </div>
            </header>

            {/* Confidential E2EE Lock Screen if launched from strict QR without key */}
            {state.e2eeLockedOnMobile ? (
              <main className="flex-1 p-5 flex flex-col justify-center space-y-4">
                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-amber-400 text-sm font-bold">
                    <KeyRound className="w-5 h-5" />
                    <span>Poverljiva aktivacija klijenta ({state.activeTenantId})</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Ova instalacija koristi izolovanu putanju i ne sadrži ključ u QR kodu.
                    Unesite interni E2EE ključ vaše kompanije za lokalno šifrovanje i
                    sinhronizaciju sa dispečerskim centrom.
                  </p>
                  <input
                    type="password"
                    value={e2eeInput}
                    onChange={(e) => setE2eeInput(e.target.value)}
                    placeholder="Unesite E2EE ključ kompanije..."
                    className="w-full min-h-[44px] bg-slate-950 border border-slate-700 rounded-xl px-3 text-sm font-mono text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (e2eeInput.trim()) unlockMobileE2ee(e2eeInput);
                    }}
                    className="w-full min-h-[48px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm cursor-pointer"
                  >
                    Otključaj lokalni trezor
                  </button>
                </div>
              </main>
            ) : !driver ? (
              <main className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
                <PWAInstallButton tenantName={state.activeTenantId || 'ŽP Kabina'} />
                {syncError && (
                  <div className="p-3 rounded-xl bg-red-950/70 border border-red-700 text-xs text-red-200 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                    <span>{syncError}</span>
                  </div>
                )}
                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2 text-center">
                  <TrainFront className="w-8 h-8 text-amber-400 mx-auto" />
                  <h2 className="text-sm font-bold text-slate-100">
                    Kabinski trezor čeka sinhronizaciju
                  </h2>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {state.activeTenantId
                      ? 'Dodajte mašinovođu i smenu na Upravnom desktopu — šifrovana koverta će se automatski pojaviti u ovoj kabini.'
                      : 'Otvorite Početni ekran (ikona knjige gore) ili skenirajte personalizovani QR kod sa Upravnog desktopa.'}
                  </p>
                </div>
              </main>
            ) : (
              <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {/* Specialized PWA Install Prompt (hides automatically in standalone mode) */}
                <PWAInstallButton tenantName={state.activeTenantId || 'ŽP Kabina'} />

                {syncError && (
                  <div className="p-3 rounded-xl bg-red-950/70 border border-red-700 text-xs text-red-200 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                    <span>{syncError}</span>
                  </div>
                )}

                {feedbackMsg && (
                  <div
                    role="status"
                    className="px-3 py-2.5 rounded-xl bg-emerald-900/60 border border-emerald-600/60 text-emerald-100 text-xs font-medium flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>{feedbackMsg}</span>
                  </div>
                )}

                {tab === 'shifts' && (
                  <div className="space-y-4">
                    <section className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                        <span>Obavezni dnevni odmor (lokalni motor)</span>
                        <span className="font-mono">
                          {driver.lastShiftEndedAwayFromBase
                            ? `Van baze (min ${mob.ruleConfig.minRestAwayHours}h)`
                            : `Baza (min ${mob.ruleConfig.minRestHomeHours}h)`}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between mt-1">
                        <div className="text-2xl font-bold font-mono tabular-nums text-slate-50">
                          {restInfo.remaining > 0
                            ? `Još ${formatHours(restInfo.remaining)}`
                            : 'Odmor završen'}
                        </div>
                        <span
                          className={`text-xs font-semibold ${
                            restInfo.remaining > 0 ? 'text-amber-400' : 'text-emerald-400'
                          }`}
                        >
                          {driver.status}
                        </span>
                      </div>
                      <div className="mt-3 h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            restInfo.remaining > 0 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{
                            width: `${Math.min(100, (restInfo.elapsed / restInfo.required) * 100)}%`,
                          }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                        <span>Proteklo: {formatHours(restInfo.elapsed)}</span>
                        <span>Matična: {driver.homeStation}</span>
                      </div>
                    </section>

                    <section className="space-y-3">
                      <h2 className="text-sm font-semibold text-slate-200">
                        Dodeljene smene ({driverShifts.length})
                      </h2>

                      {driverShifts.length === 0 ? (
                        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 text-center text-sm text-slate-400">
                          Trenutno nema dodeljenih smena u lokalnom prozoru.
                        </div>
                      ) : (
                        driverShifts.map((shift) => (
                          <article
                            key={shift.id}
                            className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-xs text-slate-400 flex items-center gap-1.5">
                                  <span>Voz {shift.trainNumber}</span>
                                  <span aria-hidden="true">·</span>
                                  <span>{shift.locomotiveCode}</span>
                                </div>
                                <h3 className="text-base font-semibold text-slate-50 mt-0.5">
                                  {shift.routeFrom} → {shift.routeTo}
                                </h3>
                                <p className="text-xs text-slate-400 mt-0.5">
                                  {shift.clientOperator}
                                </p>
                              </div>
                              <span
                                className={`text-xs font-semibold whitespace-nowrap ${
                                  shift.status === 'U toku'
                                    ? 'text-emerald-400'
                                    : shift.status === 'Planirana'
                                    ? 'text-amber-400'
                                    : 'text-slate-400'
                                }`}
                              >
                                {shift.status}
                              </span>
                            </div>

                            <div className="text-xs font-mono text-slate-300 flex items-center justify-between py-2 border-y border-slate-800">
                              <span>Početak: {formatDateTimeSr(shift.startTime)}</span>
                              <span>Kraj: {formatTimeSr(shift.endTime)}</span>
                            </div>

                            {shift.isEmergencyOverride && (
                              <div className="p-2.5 rounded-xl bg-red-950/60 border border-red-700/60 text-xs text-red-200">
                                <span className="font-semibold block">
                                  {shift.overtimeClassification}
                                </span>
                                <span className="text-red-300/90">{shift.overrideReason}</span>
                              </div>
                            )}

                            <div className="space-y-1.5">
                              <div className="text-xs font-medium text-slate-400">
                                Segmenti smene:
                              </div>
                              {shift.segments.map((seg) => (
                                <div
                                  key={seg.id}
                                  className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80"
                                >
                                  <span className="text-slate-200 truncate pr-2">
                                    {seg.label}
                                  </span>
                                  <span className="font-mono text-slate-400 whitespace-nowrap">
                                    {formatTimeSr(seg.startTime)}–{formatTimeSr(seg.endTime)} ({seg.durationHours}h)
                                  </span>
                                </div>
                              ))}
                            </div>

                            {shift.status !== 'Završena' && (
                              <button
                                type="button"
                                onClick={() => setTab('driving')}
                                className="w-full min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors cursor-pointer"
                              >
                                Otvori aktivnu vožnju
                              </button>
                            )}
                          </article>
                        ))
                      )}
                    </section>
                  </div>
                )}

                {tab === 'driving' && (
                  <div className="space-y-4">
                    <section className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">Aktivna / sledeća smena</span>
                        <span className="text-xs font-mono text-amber-400">
                          {focusShift ? `Voz ${focusShift.trainNumber}` : 'Slobodna vožnja'}
                        </span>
                      </div>

                      {focusShift ? (
                        <>
                          <div className="text-lg font-bold text-slate-50">
                            {focusShift.routeFrom} → {focusShift.routeTo}
                          </div>
                          <div className="text-xs text-slate-400">
                            Lokomotiva {focusShift.locomotiveCode} · {focusShift.clientOperator}
                          </div>

                          {localRulePreview && (
                            <div
                              className={`text-[11px] px-2.5 py-1.5 rounded-lg border ${
                                localRulePreview.allowed || focusShift.isEmergencyOverride
                                  ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-300'
                                  : 'bg-red-950/50 border-red-700/60 text-red-200'
                              }`}
                            >
                              Lokalni motor pravila:{' '}
                              {focusShift.isEmergencyOverride
                                ? 'Odobreno vanredno (Force Majeure)'
                                : localRulePreview.summaryMessage}
                            </div>
                          )}

                          {focusShift.status === 'Planirana' && (
                            <button
                              type="button"
                              onClick={() => {
                                startShiftFromMobile(focusShift.id);
                                showToast(
                                  state.offlineTunnelMode
                                    ? 'Početak smene sačuvan lokalno'
                                    : 'Početak smene šifrovan i poslat na Gateway'
                                );
                              }}
                              className="w-full min-h-[52px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-base flex items-center justify-center gap-2 transition-colors cursor-pointer"
                            >
                              <Play className="w-5 h-5" />
                              <span>Započni smenu</span>
                            </button>
                          )}

                          {focusShift.status === 'U toku' && (
                            <button
                              type="button"
                              onClick={() => {
                                endShiftFromMobile(focusShift.id);
                                showToast(
                                  state.offlineTunnelMode
                                    ? 'Završetak smene sačuvan lokalno'
                                    : 'Završetak smene šifrovan i poslat na Gateway'
                                );
                              }}
                              className="w-full min-h-[52px] rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-base flex items-center justify-center gap-2 transition-colors cursor-pointer"
                            >
                              <Square className="w-5 h-5" />
                              <span>Završi smenu</span>
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="text-sm text-slate-400">
                          Nema aktivne planirane smene. Možete uneti vanredni terenski zapis ispod.
                        </div>
                      )}
                    </section>

                    <section className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                      <h2 className="text-sm font-semibold text-slate-200">
                        Brza prijava sa pruge
                      </h2>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Stanica</label>
                          <select
                            value={logStation}
                            onChange={(e) => setLogStation(e.target.value)}
                            className="w-full min-h-[44px] bg-slate-950 border border-slate-700 rounded-xl px-2.5 text-sm text-slate-100"
                          >
                            {STATIONS.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Broj voza</label>
                          <input
                            type="text"
                            value={logTrain}
                            onChange={(e) => setLogTrain(e.target.value)}
                            className="w-full min-h-[44px] bg-slate-950 border border-slate-700 rounded-xl px-2.5 text-sm font-mono text-slate-100"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Relacija / Trasa</label>
                        <input
                          type="text"
                          value={logRoute}
                          onChange={(e) => setLogRoute(e.target.value)}
                          className="w-full min-h-[44px] bg-slate-950 border border-slate-700 rounded-xl px-3 text-sm text-slate-100"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-slate-400 mb-1">
                          Napomena ili opis kvara (opciono)
                        </label>
                        <input
                          type="text"
                          value={logNote}
                          onChange={(e) => setLogNote(e.target.value)}
                          placeholder="Npr. ulazni signal, ukrštanje, pad napona..."
                          className="w-full min-h-[44px] bg-slate-950 border border-slate-700 rounded-xl px-3 text-sm text-slate-100 placeholder:text-slate-600"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleQuickLog(
                              'PROLAZNO_VREME',
                              `Prolazno vreme u stanici ${logStation} (voz ${logTrain}).`
                            )
                          }
                          className="min-h-[52px] rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-semibold flex flex-col items-center justify-center gap-1 px-2 cursor-pointer"
                        >
                          <Navigation className="w-4 h-4 text-emerald-400" />
                          <span>Prolazno vreme</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleQuickLog(
                              'PAUZA',
                              `Prijavljena pauza / čekanje u stanici ${logStation}.`
                            )
                          }
                          className="min-h-[52px] rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-semibold flex flex-col items-center justify-center gap-1 px-2 cursor-pointer"
                        >
                          <PauseCircle className="w-4 h-4 text-sky-400" />
                          <span>Pauza / Čekanje</span>
                        </button>
                      </div>

                      <div className="pt-2 border-t border-slate-800 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-xs text-slate-400">Kašnjenje (min):</label>
                          <input
                            type="number"
                            min={1}
                            max={600}
                            value={delayMinutes}
                            onChange={(e) => setDelayMinutes(Number(e.target.value) || 0)}
                            className="w-24 min-h-[40px] bg-slate-950 border border-slate-700 rounded-lg px-2.5 text-sm font-mono text-right text-slate-100"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleQuickLog(
                              'ZASTOJ_KVAR',
                              `Prijavljen zastoj/kvar u stanici ${logStation} (${delayMinutes} min).`,
                              delayMinutes
                            )
                          }
                          className="w-full min-h-[48px] rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <AlertTriangle className="w-4 h-4" />
                          <span>Prijavi zastoj / tehnički kvar</span>
                        </button>
                      </div>
                    </section>

                    <section className="space-y-2">
                      <h3 className="text-xs font-semibold text-slate-400">
                        Poslednji zapisi u rolling window baferu
                      </h3>
                      {recentDriverLogs.map((log) => (
                        <div
                          key={log.id}
                          className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-200">{log.station}</span>
                            <span
                              className={`font-mono ${
                                log.pendingSync ? 'text-amber-400' : 'text-emerald-400'
                              }`}
                            >
                              {log.pendingSync ? 'Čeka sinhronizaciju' : formatTimeSr(log.timestamp)}
                            </span>
                          </div>
                          <p className="text-slate-400">{log.description}</p>
                        </div>
                      ))}
                    </section>
                  </div>
                )}

                {tab === 'vehicles' && (
                  <form onSubmit={handleHandoverSubmit} className="space-y-4">
                    <section className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                      <h2 className="text-sm font-semibold text-slate-200">
                        Primopredaja službenog vozila
                      </h2>

                      {mob.vehicles.length === 0 ? (
                        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 text-center">
                          Nema dodeljenih službenih vozila u lokalnom trezoru. Dodajte vozilo na Upravnom desktopu.
                        </div>
                      ) : (
                        <>
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">
                              Službeno vozilo
                            </label>
                            <select
                              value={selectedVehicleId}
                              onChange={(e) => setSelectedVehicleId(e.target.value)}
                              className="w-full min-h-[44px] bg-slate-950 border border-slate-700 rounded-xl px-3 text-sm text-slate-100"
                            >
                              {mob.vehicles.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.model} ({v.plate}) — {v.currentStation}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
                            <button
                              type="button"
                              onClick={() => setHandoverAction('PREUZIMANJE')}
                              className={`min-h-[44px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                                handoverAction === 'PREUZIMANJE'
                                  ? 'bg-emerald-500 text-slate-950'
                                  : 'text-slate-300 hover:text-white'
                              }`}
                            >
                              Preuzimanje vozila
                            </button>
                            <button
                              type="button"
                              onClick={() => setHandoverAction('PREDAJA')}
                              className={`min-h-[44px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                                handoverAction === 'PREDAJA'
                                  ? 'bg-amber-500 text-slate-950'
                                  : 'text-slate-300 hover:text-white'
                              }`}
                            >
                              Predaja na stanici
                            </button>
                          </div>

                          <div>
                            <label className="block text-xs text-slate-400 mb-1">
                              Stanica primopredaje
                            </label>
                            <select
                              value={handoverStation}
                              onChange={(e) => setHandoverStation(e.target.value)}
                              className="w-full min-h-[44px] bg-slate-950 border border-slate-700 rounded-xl px-3 text-sm text-slate-100"
                            >
                              {STATIONS.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="grid grid-cols-2 gap-2.5">
                            <div>
                              <label className="block text-xs text-slate-400 mb-1">
                                Kilometraža (km)
                              </label>
                              <input
                                type="number"
                                required
                                min={0}
                                value={mileageKm}
                                onChange={(e) => setMileageKm(Number(e.target.value))}
                                className="w-full min-h-[44px] bg-slate-950 border border-slate-700 rounded-xl px-3 text-sm font-mono text-slate-100"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-400 mb-1">
                                Gorivo (%)
                              </label>
                              <input
                                type="number"
                                required
                                min={0}
                                max={100}
                                value={fuelPercent}
                                onChange={(e) => setFuelPercent(Number(e.target.value))}
                                className="w-full min-h-[44px] bg-slate-950 border border-slate-700 rounded-xl px-3 text-sm font-mono text-slate-100"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs text-slate-400 mb-1">
                              Stanje vozila / prijava oštećenja
                            </label>
                            <textarea
                              rows={2}
                              value={conditionNote}
                              onChange={(e) => setConditionNote(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-sm text-slate-100"
                            />
                          </div>

                          <div className="space-y-2 pt-1">
                            <span className="block text-xs font-medium text-slate-400">
                              Zadužena oprema (ček lista):
                            </span>
                            {[
                              ['radioStanica', 'Službena radio-stanica'],
                              ['ključevi', 'Ključevi vozila i lokomotive'],
                              ['prsluk', 'Reflektujući prsluk (EN ISO 20471)'],
                              ['dokumentacija', 'Saobraćajna i putni nalog'],
                            ].map(([key, label]) => (
                              <label
                                key={key}
                                className="flex items-center justify-between min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer"
                              >
                                <span className="text-sm text-slate-200">{label}</span>
                                <input
                                  type="checkbox"
                                  checked={equipment[key]}
                                  onChange={(e) =>
                                    setEquipment((prev) => ({
                                      ...prev,
                                      [key]: e.target.checked,
                                    }))
                                  }
                                  className="w-5 h-5 accent-amber-500"
                                />
                              </label>
                            ))}
                          </div>

                          <button
                            type="submit"
                            className="w-full min-h-[50px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-colors cursor-pointer"
                          >
                            Potvrdi primopredaju vozila
                          </button>
                        </>
                      )}
                    </section>
                  </form>
                )}

                {tab === 'messages' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-slate-200">
                        Dispečerska obaveštenja
                      </h2>
                      <span className="text-xs font-mono text-amber-400">
                        Nepotvrđeno: {unreadCount}
                      </span>
                    </div>

                    {driverMessages.map((msg) => {
                      const ackAt = msg.acknowledgedAtByDriver[driver.id];
                      return (
                        <article
                          key={msg.id}
                          className={`p-4 rounded-2xl border space-y-2.5 ${
                            msg.priority === 'Hitno' && !ackAt
                              ? 'bg-red-950/40 border-red-700/70'
                              : 'bg-slate-900 border-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span
                              className={`font-semibold ${
                                msg.priority === 'Hitno' ? 'text-red-400' : 'text-sky-400'
                              }`}
                            >
                              {msg.priority} · {msg.senderName}
                            </span>
                            <span className="font-mono text-slate-400">
                              {formatTimeSr(msg.createdAt)}
                            </span>
                          </div>

                          <h3 className="text-base font-semibold text-slate-100">
                            {msg.title}
                          </h3>
                          <p className="text-sm text-slate-300 leading-relaxed">{msg.body}</p>

                          {ackAt ? (
                            <div className="pt-2 border-t border-slate-800 text-xs text-emerald-400 font-mono flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Prijem potvrđen u {formatDateTimeSr(ackAt)}</span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                acknowledgeMessage(msg.id, driver.id);
                                showToast('Potvrda prijema poslata ka Gateway-u');
                              }}
                              className="w-full min-h-[48px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-colors cursor-pointer"
                            >
                              Potvrdi prijem (Read Receipt)
                            </button>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </main>
            )}

            <nav
              aria-label="Mobilna navigacija mašinovođe"
              className="grid grid-cols-4 bg-slate-900 border-t border-slate-800 shrink-0"
            >
              {[
                { id: 'shifts', label: 'Smene', icon: CalendarClock },
                { id: 'driving', label: 'Vožnja', icon: TrainFront },
                { id: 'vehicles', label: 'Vozila', icon: Car },
                {
                  id: 'messages',
                  label: unreadCount > 0 ? `Poruke (${unreadCount})` : 'Poruke',
                  icon: MessageSquare,
                },
              ].map((item) => {
                const Icon = item.icon;
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`min-h-[58px] flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors cursor-pointer ${
                      active
                        ? 'text-amber-400 bg-slate-800/50'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="whitespace-nowrap">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </>
        )}
      </div>
    </div>
  );
};
