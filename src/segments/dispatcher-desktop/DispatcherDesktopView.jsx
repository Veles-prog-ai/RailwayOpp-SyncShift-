import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  BookOpen,
  CalendarPlus,
  Car,
  CheckCircle2,
  ClipboardCheck,
  Cpu,
  Download,
  FileSpreadsheet,
  Filter,
  Lock,
  QrCode,
  Save,
  Send,
  ShieldAlert,
  Sliders,
  Sparkles,
  UserPlus,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { ClientQrProvisioner } from '../../components/ClientQrProvisioner';
import { StartScreen } from '../../components/StartScreen';
import { apiFetch, apiUrl } from '../../core/apiClient';
import {
  buildAnonymizedAuditPayload,
  runLocalDeterministicAudit,
} from '../../core/localAnalyzer';
import {
  calculateShiftDurations,
  evaluateShiftAssignment,
  getDriverRemainingRestHours,
} from '../../core/ruleEngine';
import { useSystem } from '../../core/store';
import {
  formatDateTimeSr,
  formatHours,
  formatTimeSr,
  STATIONS,
  toLocalInputValue,
} from '../../core/utils';

export const DispatcherDesktopView = () => {
  const {
    state,
    gatewaySnapshot,
    configureConnection,
    acceptDesktopStart,
    reopenStartScreen,
    toggleOfficeOfflineMode,
    updateFleetPassphrase,
    updateRuleConfig,
    addDriver,
    addVehicle,
    assignOrReassignShift,
    sendDispatchMessage,
    setAiAuditReport,
  } = useSystem();

  const office = state.officeNode;
  const officePendingOutbox = office.outbox.filter(
    (e) => e.deliveryState !== 'acked'
  ).length;

  const [activeTab, setActiveTab] = useState('schedule');
  const [configDraft, setConfigDraft] = useState(office.ruleConfig);
  const [configSavedNotice, setConfigSavedNotice] = useState(false);
  const [telemetryFilter, setTelemetryFilter] = useState('SVE');

  useEffect(() => {
    setConfigDraft(office.ruleConfig);
  }, [office.ruleConfig]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState(undefined);
  const [formDriverId, setFormDriverId] = useState(office.drivers[0]?.id || '');
  const [formOperator, setFormOperator] = useState('');
  const [formFrom, setFormFrom] = useState('Beograd Centar');
  const [formTo, setFormTo] = useState('Lapovo');
  const [formTrain, setFormTrain] = useState('');
  const [formLoco, setFormLoco] = useState('');
  const [formStart, setFormStart] = useState(() =>
    toLocalInputValue(new Date(Date.now() + 30 * 60000).toISOString())
  );
  const [formEnd, setFormEnd] = useState(() =>
    toLocalInputValue(new Date(Date.now() + 9.5 * 3600000).toISOString())
  );
  const [formNotes, setFormNotes] = useState('');
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [formError, setFormError] = useState(null);

  const [newDrvName, setNewDrvName] = useState('');
  const [newDrvLicense, setNewDrvLicense] = useState('');
  const [newDrvStation, setNewDrvStation] = useState('Beograd Centar');
  const [newDrvPhone, setNewDrvPhone] = useState('');

  const [newVehModel, setNewVehModel] = useState('');
  const [newVehPlate, setNewVehPlate] = useState('');
  const [newVehStation, setNewVehStation] = useState('Beograd Centar');
  const [newVehKm, setNewVehKm] = useState(0);
  const [newVehFuel, setNewVehFuel] = useState(100);

  const [msgRecipient, setMsgRecipient] = useState('ALL');
  const [msgPriority, setMsgPriority] = useState('Hitno');
  const [msgTitle, setMsgTitle] = useState('');
  const [msgBody, setMsgBody] = useState('');
  const [msgSentOk, setMsgSentOk] = useState(false);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);

  const knownOperators = useMemo(
    () => Array.from(new Set(office.shifts.map((s) => s.clientOperator).filter(Boolean))),
    [office.shifts]
  );

  const selectedDriver = office.drivers.find((d) => d.id === formDriverId);

  const liveEvaluation = useMemo(() => {
    if (!selectedDriver) return null;
    const startIso = new Date(formStart).toISOString();
    const endIso = new Date(formEnd).toISOString();
    return evaluateShiftAssignment({
      driver: selectedDriver,
      candidateShift: {
        id: editingShiftId,
        startTime: startIso,
        endTime: endIso,
      },
      existingShifts: office.shifts,
      config: office.ruleConfig,
    });
  }, [selectedDriver, formStart, formEnd, editingShiftId, office.shifts, office.ruleConfig]);

  const openNewShiftModal = (preselectedDriverId) => {
    setEditingShiftId(undefined);
    setFormDriverId(preselectedDriverId || office.drivers[0]?.id || '');
    setFormOperator(knownOperators[0] || '');
    setFormFrom('Beograd Centar');
    setFormTo('Lapovo');
    setFormTrain('');
    setFormLoco('');
    setFormStart(toLocalInputValue(new Date(Date.now() + 30 * 60000).toISOString()));
    setFormEnd(toLocalInputValue(new Date(Date.now() + 9.5 * 3600000).toISOString()));
    setFormNotes('');
    setOverrideEnabled(false);
    setOverrideReason('');
    setFormError(null);
    setModalOpen(true);
  };

  const openReassignModal = (shift) => {
    setEditingShiftId(shift.id);
    setFormDriverId(shift.driverId);
    setFormOperator(shift.clientOperator);
    setFormFrom(shift.routeFrom);
    setFormTo(shift.routeTo);
    setFormTrain(shift.trainNumber);
    setFormLoco(shift.locomotiveCode);
    setFormStart(toLocalInputValue(shift.startTime));
    setFormEnd(toLocalInputValue(shift.endTime));
    setFormNotes(shift.notes || '');
    setOverrideEnabled(false);
    setOverrideReason('');
    setFormError(null);
    setModalOpen(true);
  };

  const handleSaveShift = (e) => {
    e.preventDefault();
    setFormError(null);

    if (liveEvaluation && !liveEvaluation.allowed && (!overrideEnabled || !overrideReason.trim())) {
      setFormError(
        'Smena je blokirana od strane determinističkog motora. Izaberite drugog mašinovođu ili aktivirajte Vanredno odobrenje uz obavezan pisani razlog.'
      );
      return;
    }

    const res = assignOrReassignShift({
      shiftId: editingShiftId,
      driverId: formDriverId,
      clientOperator: formOperator,
      routeFrom: formFrom,
      routeTo: formTo,
      trainNumber: formTrain,
      locomotiveCode: formLoco,
      startTime: new Date(formStart).toISOString(),
      endTime: new Date(formEnd).toISOString(),
      notes: formNotes,
      emergencyOverrideReason: overrideEnabled ? overrideReason.trim() : undefined,
    });

    if (!res.ok) {
      setFormError(res.evaluation.summaryMessage);
      return;
    }

    setModalOpen(false);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!msgTitle.trim() || !msgBody.trim()) return;
    sendDispatchMessage({
      recipientDriverId: msgRecipient,
      title: msgTitle.trim(),
      body: msgBody.trim(),
      priority: msgPriority,
    });
    setMsgTitle('');
    setMsgBody('');
    setMsgSentOk(true);
    setTimeout(() => setMsgSentOk(false), 2500);
  };

  const billingByDriver = useMemo(() => {
    return office.drivers.map((drv) => {
      const drvShifts = office.shifts.filter((s) => s.driverId === drv.id);
      let regularH = 0;
      let nightH = 0;
      let emergencyOvertimeH = 0;
      let waitReziH = 0;
      let vehicleKm = 0;

      for (const s of drvShifts) {
        const { drivingHours, totalShiftHours } = calculateShiftDurations(
          s.startTime,
          s.endTime,
          s.segments
        );
        const rezi = s.segments
          .filter((seg) => seg.type === 'čekanje_reži')
          .reduce((acc, seg) => acc + seg.durationHours, 0);

        waitReziH += rezi;
        vehicleKm += s.vehicleKmUsed || 0;

        if (s.isEmergencyOverride) {
          emergencyOvertimeH += totalShiftHours;
        } else if (s.overtimeClassification === 'Noćni rad') {
          nightH += drivingHours;
          regularH += Math.max(0, totalShiftHours - drivingHours - rezi);
        } else {
          regularH += Math.max(0, totalShiftHours - rezi);
        }
      }

      return {
        driver: drv,
        shiftCount: drvShifts.length,
        regularH: Number(regularH.toFixed(2)),
        nightH: Number(nightH.toFixed(2)),
        emergencyOvertimeH: Number(emergencyOvertimeH.toFixed(2)),
        waitReziH: Number(waitReziH.toFixed(2)),
        vehicleKm,
      };
    });
  }, [office.drivers, office.shifts]);

  const billingByClient = useMemo(() => {
    const operators = Array.from(
      new Set(office.shifts.map((s) => s.clientOperator).filter(Boolean))
    );
    return operators.map((client) => {
      const cShifts = office.shifts.filter((s) => s.clientOperator === client);
      let regularH = 0;
      let nightH = 0;
      let emergencyOvertimeH = 0;
      let waitReziH = 0;
      let vehicleKm = 0;

      for (const s of cShifts) {
        const { drivingHours, totalShiftHours } = calculateShiftDurations(
          s.startTime,
          s.endTime,
          s.segments
        );
        const rezi = s.segments
          .filter((seg) => seg.type === 'čekanje_reži')
          .reduce((acc, seg) => acc + seg.durationHours, 0);

        waitReziH += rezi;
        vehicleKm += s.vehicleKmUsed || 0;

        if (s.isEmergencyOverride) {
          emergencyOvertimeH += totalShiftHours;
        } else if (s.overtimeClassification === 'Noćni rad') {
          nightH += drivingHours;
          regularH += Math.max(0, totalShiftHours - drivingHours - rezi);
        } else {
          regularH += Math.max(0, totalShiftHours - rezi);
        }
      }

      return {
        client,
        shiftCount: cShifts.length,
        regularH: Number(regularH.toFixed(2)),
        nightH: Number(nightH.toFixed(2)),
        emergencyOvertimeH: Number(emergencyOvertimeH.toFixed(2)),
        waitReziH: Number(waitReziH.toFixed(2)),
        vehicleKm,
      };
    });
  }, [office.shifts]);

  const handleExportCsv = () => {
    const lines = [
      'Tip izveštaja;Subjekat;Broj smena;Redovni sati (h);Noćni sati (h);Vanredni prekovremeni (h);Čekanje/Reži (h);Kilometraža vozila (km)',
      ...billingByDriver.map(
        (r) =>
          `Mašinovođa;${r.driver.name};${r.shiftCount};${r.regularH};${r.nightH};${r.emergencyOvertimeH};${r.waitReziH};${r.vehicleKm}`
      ),
      ...billingByClient.map(
        (c) =>
          `Klijent operater;${c.client};${c.shiftCount};${c.regularH};${c.nightH};${c.emergencyOvertimeH};${c.waitReziH};${c.vehicleKm}`
      ),
    ];
    const csvContent = '\uFEFF' + lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `obracun-smena-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRunLocalAudit = () => {
    setAiError(null);
    const report = runLocalDeterministicAudit(office);
    setAiAuditReport(report);
  };

  const handleRunGeminiAudit = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const anonymizedPayload = buildAnonymizedAuditPayload(office);
      const resp = await apiFetch('/api/ai-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anonymizedPayload }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setAiError(data.error || 'Greška prilikom poziva AI servisa.');
        return;
      }
      const report = {
        generatedAt: new Date().toISOString(),
        mode: 'gemini-anonymized',
        summary: data.summary,
        anomalies: data.anomalies || [],
        optimizationRecommendations: data.optimizationRecommendations || [],
      };
      setAiAuditReport(report);
    } catch (err) {
      setAiError(
        err instanceof Error
          ? err.message
          : 'Mrežna greška pri komunikaciji sa serverom.'
      );
    } finally {
      setAiLoading(false);
    }
  };

  const handleAddDriverSubmit = (e) => {
    e.preventDefault();
    if (!newDrvName.trim() || !newDrvLicense.trim()) return;
    addDriver({
      name: newDrvName,
      licenseCode: newDrvLicense,
      homeStation: newDrvStation,
      phone: newDrvPhone,
    });
    setNewDrvName('');
    setNewDrvLicense('');
    setNewDrvPhone('');
  };

  const handleAddVehicleSubmit = (e) => {
    e.preventDefault();
    if (!newVehModel.trim() || !newVehPlate.trim()) return;
    addVehicle({
      model: newVehModel,
      plate: newVehPlate,
      currentStation: newVehStation,
      mileageKm: newVehKm,
      nextServiceKm: newVehKm + 15000,
      fuelPercent: newVehFuel,
    });
    setNewVehModel('');
    setNewVehPlate('');
    setNewVehKm(0);
    setNewVehFuel(100);
  };

  const driverMap = new Map(office.drivers.map((d) => [d.id, d]));

  if (!state.desktopStartAccepted) {
    return (
      <StartScreen
        mode="desktop"
        tenantId={state.activeTenantId}
        pathwayToken={state.activePathwayToken}
        fleetPassphrase={state.fleetPassphrase}
        onConfirmAndStart={(cfg) => {
          if (cfg.tenantId && cfg.pathwayToken) {
            configureConnection(cfg);
          } else if (cfg.fleetPassphrase) {
            updateFleetPassphrase(cfg.fleetPassphrase);
          }
          acceptDesktopStart();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
    <div className="max-w-[1380px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Local Office Vault & Gateway Sync Status Bar */}
      <div className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3 text-slate-700">
          <span className="font-bold text-slate-900">Železnički Pogon</span>
          <span className="text-slate-300">|</span>
          <span className="font-semibold text-slate-900">
            Upravni desktop ({state.activeTenantId || 'Lokalni rad'})
          </span>
          <span className="text-slate-400">·</span>
          <span className="font-mono">
            Outbox (čeka ACK): {officePendingOutbox}
          </span>
          <span className="text-slate-400">·</span>
          <span className="font-mono">
            Na Gateway-u za kancelariju: {gatewaySnapshot.queuedOffice}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => reopenStartScreen('desktop')}
            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Privatnost i uputstvo</span>
          </button>

          <button
            type="button"
            onClick={toggleOfficeOfflineMode}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 border cursor-pointer ${
              state.officeOfflineMode
                ? 'bg-red-50 text-red-800 border-red-300'
                : 'bg-emerald-50 text-emerald-800 border-emerald-300'
            }`}
          >
            {state.officeOfflineMode ? (
              <WifiOff className="w-3.5 h-3.5" />
            ) : (
              <Wifi className="w-3.5 h-3.5" />
            )}
            <span>
              {state.officeOfflineMode
                ? 'Kancelarija Offline (lokalni rad)'
                : 'Kancelarija Online (E2EE Gateway)'}
            </span>
          </button>
        </div>
      </div>

      {/* Sub-Navigation + Primary Action */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          {[
            { id: 'schedule', label: 'Plan vožnje i Raspored' },
            { id: 'messaging', label: 'Hitne poruke i Preraspored' },
            { id: 'billing', label: 'Izveštaji i Obračun' },
            { id: 'fleet-engine', label: 'Flota, Motor & Audit' },
            { id: 'ai-audit', label: 'Kontrola izveštaja (Lokalno / AI)' },
            { id: 'qr-access', label: 'Povezivanje kabine (QR)' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 rounded-md text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={office.drivers.length === 0}
          onClick={() => openNewShiftModal()}
          className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap cursor-pointer"
        >
          <CalendarPlus className="w-4 h-4" />
          <span>Dodeli novu smenu</span>
        </button>
      </div>

      {activeTab === 'schedule' && (
        <div className="space-y-6">
          {/* Add Driver Live Form */}
          <form
            onSubmit={handleAddDriverSubmit}
            className="p-5 rounded-xl bg-white border border-slate-200 space-y-3"
          >
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-slate-700" />
              <span>Dodaj mašinovođu u lokalni trezor</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              <input
                type="text"
                required
                value={newDrvName}
                onChange={(e) => setNewDrvName(e.target.value)}
                placeholder="Ime i prezime"
                className="px-3 py-2 rounded-lg border border-slate-300 text-slate-900"
              />
              <input
                type="text"
                required
                value={newDrvLicense}
                onChange={(e) => setNewDrvLicense(e.target.value)}
                placeholder="Broj dozvole (npr. LIC-101)"
                className="px-3 py-2 rounded-lg border border-slate-300 font-mono text-slate-900"
              />
              <select
                value={newDrvStation}
                onChange={(e) => setNewDrvStation(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-slate-900"
              >
                {STATIONS.map((s) => (
                  <option key={s} value={s}>
                    Matična: {s}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={newDrvPhone}
                onChange={(e) => setNewDrvPhone(e.target.value)}
                placeholder="Telefon (opciono)"
                className="px-3 py-2 rounded-lg border border-slate-300 font-mono text-slate-900"
              />
              <button
                type="submit"
                className="py-2 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold cursor-pointer"
              >
                + Dodaj mašinovođu
              </button>
            </div>
          </form>

          <section className="p-5 rounded-xl bg-white border border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-700" />
                <span>Operativni raspored mašinovođa i aktivne smene</span>
              </h2>
              <span className="text-xs text-slate-500">
                Deterministička provera radi lokalno u desktop trezoru i kada je kancelarija offline
              </span>
            </div>

            {office.drivers.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                Lokalni trezor je prazan. Dodajte prvog mašinovođu u formi iznad da biste planirali smene i sinhronizovali mobilnu kabinu.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {office.drivers.map((drv) => {
                  const rest = getDriverRemainingRestHours(drv, office.ruleConfig);
                  const drvShifts = office.shifts.filter((s) => s.driverId === drv.id);

                  return (
                    <div
                      key={drv.id}
                      className="py-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center"
                    >
                      <div className="lg:col-span-4 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">{drv.name}</span>
                          <span
                            className={`text-xs font-semibold ${
                              drv.status === 'Dostupan'
                                ? 'text-emerald-700'
                                : drv.status === 'Na smeni'
                                ? 'text-sky-700'
                                : drv.status === 'Vanredno angažovan'
                                ? 'text-red-700'
                                : 'text-amber-700'
                            }`}
                          >
                            {drv.status}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                          <span className="font-mono">{drv.licenseCode}</span>
                          <span>·</span>
                          <span>Stanica: {drv.currentStation}</span>
                          <span>·</span>
                          <span>
                            {rest.remaining > 0
                              ? `Odmor još ${formatHours(rest.remaining)}`
                              : 'Odmor ispunjen'}
                          </span>
                        </div>
                      </div>

                      <div className="lg:col-span-6 flex flex-wrap gap-2">
                        {drvShifts.length === 0 ? (
                          <span className="text-xs text-slate-400">
                            Nema planiranih smena u ovom ciklusu
                          </span>
                        ) : (
                          drvShifts.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => openReassignModal(s)}
                              className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors cursor-pointer ${
                                s.isEmergencyOverride
                                  ? 'bg-red-50 border-red-300 hover:bg-red-100'
                                  : s.status === 'U toku'
                                  ? 'bg-emerald-50 border-emerald-300 hover:bg-emerald-100'
                                  : s.status === 'Planirana'
                                  ? 'bg-amber-50 border-amber-300 hover:bg-amber-100'
                                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                                <span className="font-mono">Voz {s.trainNumber}</span>
                                <span>·</span>
                                <span>
                                  {s.routeFrom} → {s.routeTo}
                                </span>
                              </div>
                              <div className="text-slate-600 mt-0.5 flex items-center gap-2">
                                <span className="font-mono">
                                  {formatTimeSr(s.startTime)}–{formatTimeSr(s.endTime)}
                                </span>
                                <span>·</span>
                                <span>{s.clientOperator}</span>
                                <span>·</span>
                                <span className="font-semibold">{s.status}</span>
                              </div>
                            </button>
                          ))
                        )}
                      </div>

                      <div className="lg:col-span-2 flex justify-start lg:justify-end">
                        <button
                          type="button"
                          onClick={() => openNewShiftModal(drv.id)}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-xs font-semibold text-slate-800 whitespace-nowrap cursor-pointer"
                        >
                          + Dodeli smenu
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'messaging' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleSendMessage}
            className="lg:col-span-5 p-5 rounded-xl bg-white border border-slate-200 space-y-4"
          >
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Send className="w-4 h-4 text-slate-700" />
              <span>Slanje hitnog dispečerskog obaveštenja</span>
            </h2>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Primalac
              </label>
              <select
                value={msgRecipient}
                onChange={(e) => setMsgRecipient(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
              >
                <option value="ALL">Svim mašinovođama (grupna poruka)</option>
                {office.drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.currentStation})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Prioritet
              </label>
              <div className="grid grid-cols-2 gap-2">
                {['Hitno', 'Obaveštenje'].map((prio) => (
                  <button
                    key={prio}
                    type="button"
                    onClick={() => setMsgPriority(prio)}
                    className={`py-2 rounded-lg text-xs font-semibold border cursor-pointer ${
                      msgPriority === prio
                        ? prio === 'Hitno'
                          ? 'bg-red-600 text-white border-red-600'
                          : 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    {prio}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Naslov poruke
              </label>
              <input
                type="text"
                required
                value={msgTitle}
                onChange={(e) => setMsgTitle(e.target.value)}
                placeholder="Npr. Izmena trase kod Lapova"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Tekst instrukcije
              </label>
              <textarea
                rows={3}
                required
                value={msgBody}
                onChange={(e) => setMsgBody(e.target.value)}
                placeholder="Unesite instrukciju koja zahteva potvrdu prijema u mobilnoj aplikaciji..."
                className="w-full p-3 rounded-lg border border-slate-300 text-sm text-slate-900"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold cursor-pointer"
            >
              Pošalji poruku mašinovođi
            </button>

            {msgSentOk && (
              <div className="text-xs font-medium text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {state.officeOfflineMode
                    ? 'Poruka sačuvana u lokalni Outbox (biće šifrovana kada kancelarija bude online).'
                    : 'Poruka je šifrovana (AES-GCM) i prosleđena preko Gateway-a.'}
                </span>
              </div>
            )}
          </form>

          <div className="lg:col-span-7 space-y-6">
            <section className="p-5 rounded-xl bg-white border border-slate-200 space-y-3">
              <h3 className="text-base font-bold text-slate-900">
                Status potvrde prijema poruka (Read Receipts)
              </h3>
              <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
                {office.messages.map((msg) => {
                  const targetDrivers =
                    msg.recipientDriverId === 'ALL'
                      ? office.drivers
                      : office.drivers.filter((d) => d.id === msg.recipientDriverId);
                  const ackCount = targetDrivers.filter(
                    (d) => Boolean(msg.acknowledgedAtByDriver[d.id])
                  ).length;

                  return (
                    <div
                      key={msg.id}
                      className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900">
                          [{msg.priority}] {msg.title}
                        </span>
                        <span className="font-mono text-slate-600">
                          Potvrdilo: {ackCount}/{targetDrivers.length}
                        </span>
                      </div>
                      <p className="text-slate-700">{msg.body}</p>
                      <div className="flex flex-wrap gap-2 pt-1 text-[11px]">
                        {targetDrivers.map((d) => {
                          const at = msg.acknowledgedAtByDriver[d.id];
                          return (
                            <span
                              key={d.id}
                              className={
                                at ? 'text-emerald-700 font-medium' : 'text-amber-700'
                              }
                            >
                              {d.name}: {at ? `Potvrđeno (${formatTimeSr(at)})` : 'Čeka potvrdu'}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="p-5 rounded-xl bg-white border border-slate-200 space-y-3">
              <h3 className="text-base font-bold text-slate-900">
                Brza preraspodela aktivnih i planiranih smena
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-3 font-semibold">Voz</th>
                      <th className="py-2 pr-3 font-semibold">Relacija</th>
                      <th className="py-2 pr-3 font-semibold">Mašinovođa</th>
                      <th className="py-2 pr-3 font-semibold">Status</th>
                      <th className="py-2 text-right font-semibold">Akcija</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {office.shifts.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2.5 pr-3 font-mono font-semibold text-slate-900">
                          {s.trainNumber}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-700">
                          {s.routeFrom} → {s.routeTo}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-800">
                          {driverMap.get(s.driverId)?.name || s.driverId}
                        </td>
                        <td className="py-2.5 pr-3 font-semibold text-slate-700">
                          {s.status}
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => openReassignModal(s)}
                            className="px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-100 font-semibold text-slate-800 cursor-pointer"
                          >
                            Preraspodeli
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      )}

      {activeTab === 'billing' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-slate-700" />
                <span>Obračun sati i kilometraže (po mašinovođi i klijentu)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Automatski obračun iz lokalnog desktop / Docker trezora.
              </p>
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
          </div>

          <section className="p-5 rounded-xl bg-white border border-slate-200 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">
              Pregled po mašinovođi
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-2 pr-4 font-semibold">Mašinovođa</th>
                    <th className="py-2 pr-4 font-semibold text-right">Smene</th>
                    <th className="py-2 pr-4 font-semibold text-right">Redovni sati</th>
                    <th className="py-2 pr-4 font-semibold text-right">Noćni sati</th>
                    <th className="py-2 pr-4 font-semibold text-right">
                      Vanredni prekovremeni
                    </th>
                    <th className="py-2 pr-4 font-semibold text-right">Čekanje / Reži</th>
                    <th className="py-2 font-semibold text-right">Vozilo (km)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums text-xs sm:text-sm">
                  {billingByDriver.map((row) => (
                    <tr key={row.driver.id}>
                      <td className="py-2.5 pr-4 font-sans font-semibold text-slate-900">
                        {row.driver.name}
                      </td>
                      <td className="py-2.5 pr-4 text-right">{row.shiftCount}</td>
                      <td className="py-2.5 pr-4 text-right">{row.regularH}h</td>
                      <td className="py-2.5 pr-4 text-right">{row.nightH}h</td>
                      <td
                        className={`py-2.5 pr-4 text-right ${
                          row.emergencyOvertimeH > 0
                            ? 'text-red-700 font-bold'
                            : 'text-slate-600'
                        }`}
                      >
                        {row.emergencyOvertimeH}h
                      </td>
                      <td className="py-2.5 pr-4 text-right">{row.waitReziH}h</td>
                      <td className="py-2.5 text-right">{row.vehicleKm} km</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="p-5 rounded-xl bg-white border border-slate-200 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">
              Pregled za fakturisanje po klijentu (železničkom operateru)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-2 pr-4 font-semibold">Klijent operater</th>
                    <th className="py-2 pr-4 font-semibold text-right">Smene</th>
                    <th className="py-2 pr-4 font-semibold text-right">Redovni sati</th>
                    <th className="py-2 pr-4 font-semibold text-right">Noćni sati</th>
                    <th className="py-2 pr-4 font-semibold text-right">
                      Vanredni prekovremeni
                    </th>
                    <th className="py-2 pr-4 font-semibold text-right">Čekanje / Reži</th>
                    <th className="py-2 font-semibold text-right">Vozilo (km)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums text-xs sm:text-sm">
                  {billingByClient.map((row) => (
                    <tr key={row.client}>
                      <td className="py-2.5 pr-4 font-sans font-semibold text-slate-900">
                        {row.client}
                      </td>
                      <td className="py-2.5 pr-4 text-right">{row.shiftCount}</td>
                      <td className="py-2.5 pr-4 text-right">{row.regularH}h</td>
                      <td className="py-2.5 pr-4 text-right">{row.nightH}h</td>
                      <td
                        className={`py-2.5 pr-4 text-right ${
                          row.emergencyOvertimeH > 0
                            ? 'text-red-700 font-bold'
                            : 'text-slate-600'
                        }`}
                      >
                        {row.emergencyOvertimeH}h
                      </td>
                      <td className="py-2.5 pr-4 text-right">{row.waitReziH}h</td>
                      <td className="py-2.5 text-right">{row.vehicleKm} km</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'fleet-engine' && (
        <div className="space-y-6">
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateRuleConfig(configDraft);
                setConfigSavedNotice(true);
                setTimeout(() => setConfigSavedNotice(false), 2500);
              }}
              className="lg:col-span-4 p-5 rounded-xl bg-white border border-slate-200 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-slate-700" />
                  <span>Zakonski pragovi ({state.activeTenantId})</span>
                </h2>
                <span className="text-xs font-mono text-emerald-700 font-semibold">
                  Lokalni motor
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Min. dnevni odmor — matična baza (h)
                  </label>
                  <input
                    type="number"
                    min={6}
                    max={24}
                    step={0.5}
                    value={configDraft.minRestHomeHours}
                    onChange={(e) =>
                      setConfigDraft((p) => ({
                        ...p,
                        minRestHomeHours: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Min. dnevni odmor — van baze (h)
                  </label>
                  <input
                    type="number"
                    min={4}
                    max={24}
                    step={0.5}
                    value={configDraft.minRestAwayHours}
                    onChange={(e) =>
                      setConfigDraft((p) => ({
                        ...p,
                        minRestAwayHours: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Maks. upravljanje lokomotivom (h)
                  </label>
                  <input
                    type="number"
                    min={4}
                    max={16}
                    step={0.5}
                    value={configDraft.maxDrivingHours}
                    onChange={(e) =>
                      setConfigDraft((p) => ({
                        ...p,
                        maxDrivingHours: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Maks. ukupno trajanje smene (h)
                  </label>
                  <input
                    type="number"
                    min={6}
                    max={18}
                    step={0.5}
                    value={configDraft.maxTotalShiftHours}
                    onChange={(e) =>
                      setConfigDraft((p) => ({
                        ...p,
                        maxTotalShiftHours: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono text-slate-900"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Sačuvaj pragove</span>
              </button>

              {configSavedNotice && (
                <div className="text-xs font-medium text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Pragovi sačuvani lokalno i poslati na mobilne uređaje.</span>
                </div>
              )}
            </form>

            <div className="lg:col-span-8 p-5 rounded-xl bg-white border border-slate-200 space-y-4">
              <h2 className="text-base font-bold text-slate-900">
                Dnevnik provere determinističkog motora
              </h2>
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {office.validationLogs.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Nema zabeleženih provera u lokalnom trezoru.
                  </p>
                ) : (
                  office.validationLogs.map((entry) => (
                    <article
                      key={entry.id}
                      className={`p-3.5 rounded-lg border ${
                        entry.overridden
                          ? 'bg-amber-50/70 border-amber-300'
                          : entry.passed
                          ? 'bg-slate-50 border-slate-200'
                          : 'bg-red-50/70 border-red-300'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                          {entry.overridden ? (
                            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
                          ) : entry.passed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                          ) : (
                            <AlertOctagon className="w-4 h-4 text-red-700 shrink-0" />
                          )}
                          <span>{entry.actionLabel}</span>
                          <span className="text-slate-400">·</span>
                          <span>{entry.driverName}</span>
                        </div>
                        <span className="font-mono text-xs text-slate-500">
                          {formatDateTimeSr(entry.timestamp)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-700">{entry.summaryMessage}</p>
                    </article>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="p-5 rounded-xl bg-white border border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Car className="w-4 h-4 text-slate-700" />
                <span>Službena vozila i oprema ({state.activeTenantId || 'Lokalni trezor'})</span>
              </h2>
            </div>

            <form
              onSubmit={handleAddVehicleSubmit}
              className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 text-xs"
            >
              <input
                type="text"
                required
                value={newVehModel}
                onChange={(e) => setNewVehModel(e.target.value)}
                placeholder="Model vozila"
                className="px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
              />
              <input
                type="text"
                required
                value={newVehPlate}
                onChange={(e) => setNewVehPlate(e.target.value)}
                placeholder="Registarska oznaka"
                className="px-2.5 py-2 rounded-lg border border-slate-300 bg-white font-mono text-slate-900"
              />
              <select
                value={newVehStation}
                onChange={(e) => setNewVehStation(e.target.value)}
                className="px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
              >
                {STATIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                value={newVehKm}
                onChange={(e) => setNewVehKm(Number(e.target.value))}
                placeholder="Kilometraža"
                className="px-2.5 py-2 rounded-lg border border-slate-300 bg-white font-mono text-slate-900"
              />
              <input
                type="number"
                min={0}
                max={100}
                value={newVehFuel}
                onChange={(e) => setNewVehFuel(Number(e.target.value))}
                placeholder="Gorivo %"
                className="px-2.5 py-2 rounded-lg border border-slate-300 bg-white font-mono text-slate-900"
              />
              <button
                type="submit"
                className="py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold cursor-pointer"
              >
                + Dodaj vozilo
              </button>
            </form>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-2 pr-4 font-semibold">Vozilo</th>
                    <th className="py-2 pr-4 font-semibold">Stanica</th>
                    <th className="py-2 pr-4 font-semibold">Zadužio</th>
                    <th className="py-2 pr-4 font-semibold">Status</th>
                    <th className="py-2 pr-4 font-semibold text-right">Kilometraža</th>
                    <th className="py-2 pr-4 font-semibold text-right">Gorivo</th>
                    <th className="py-2 font-semibold">Napomena</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {office.vehicles.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-xs text-slate-500">
                        Nema registrovanih službenih vozila. Dodajte vozilo u formi iznad.
                      </td>
                    </tr>
                  ) : (
                    office.vehicles.map((veh) => (
                      <tr key={veh.id}>
                        <td className="py-2.5 pr-4">
                          <div className="font-semibold text-slate-900">{veh.model}</div>
                          <div className="text-xs font-mono text-slate-500">{veh.plate}</div>
                        </td>
                        <td className="py-2.5 pr-4">{veh.currentStation}</td>
                        <td className="py-2.5 pr-4 text-xs text-slate-700">
                          {veh.assignedDriverId
                            ? driverMap.get(veh.assignedDriverId)?.name || veh.assignedDriverId
                            : 'Slobodno / Parkirano'}
                        </td>
                        <td className="py-2.5 pr-4 text-xs font-semibold">{veh.status}</td>
                        <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                          {veh.mileageKm.toLocaleString('sr-RS')} km
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                          {veh.fuelPercent}%
                        </td>
                        <td className="py-2.5 text-xs text-slate-600">{veh.conditionNote}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Filter className="w-4 h-4 text-slate-700" />
                  <span>Klasifikator telemetrije</span>
                </h2>
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
                  {['SVE', 'Redovan rad', 'Zastoj / Tehnički kvar', 'Flota i oprema'].map(
                    (cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setTelemetryFilter(cat)}
                        className={`px-2 py-1 rounded-md font-medium cursor-pointer ${
                          telemetryFilter === cat
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600'
                        }`}
                      >
                        {cat === 'SVE' ? 'Sve' : cat}
                      </button>
                    )
                  )}
                </div>
              </div>
              <div className="space-y-2 max-h-[280px] overflow-y-auto">
                {office.telemetryLogs
                  .filter((t) =>
                    telemetryFilter === 'SVE' ? true : t.classification === telemetryFilter
                  )
                  .map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900">
                          {driverMap.get(log.driverId)?.name || log.driverId} · {log.station}
                        </span>
                        <span className="font-mono text-slate-500">
                          {formatDateTimeSr(log.timestamp)}
                        </span>
                      </div>
                      <p className="text-slate-700">{log.description}</p>
                    </div>
                  ))}
              </div>
            </div>

            <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-700" />
                <span>Lokalni Audit dnevnik</span>
              </h2>
              <div className="space-y-2 max-h-[280px] overflow-y-auto">
                {office.auditLogs.length === 0 ? (
                  <p className="text-xs text-slate-500">Nema audit zapisa.</p>
                ) : (
                  office.auditLogs.map((aud) => (
                    <div
                      key={aud.id}
                      className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900">{aud.actor}</span>
                        <span className="font-mono text-slate-500">
                          {formatDateTimeSr(aud.timestamp)}
                        </span>
                      </div>
                      <div className="text-slate-700">{aud.details}</div>
                      {aud.legalTag && (
                        <div className="text-red-700 font-semibold flex items-center gap-1">
                          <ClipboardCheck className="w-3.5 h-3.5" />
                          <span>{aud.legalTag}</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'ai-audit' && (
        <div className="space-y-6">
          <section className="p-5 rounded-xl bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 max-w-2xl">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-700" />
                <span>Privatna analiza izveštaja (0 tokena lokalno / opcioni Gemini)</span>
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Lokalni deterministički analizator detektuje anomalije bez slanja
                podataka van kancelarije (0 tokena). Opciona Gemini provera šalje
                isključivo anonimizovane šifre bez imena i brojeva telefona.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRunLocalAudit}
                className="px-4 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
              >
                <Cpu className="w-4 h-4" />
                <span>Lokalna provera (0 tokena)</span>
              </button>

              <button
                type="button"
                disabled={aiLoading}
                onClick={handleRunGeminiAudit}
                className="px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {aiLoading ? 'Analiza u toku...' : 'Gemini provera (anonimizovano)'}
                </span>
              </button>
            </div>
          </section>

          {aiError && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-300 text-sm text-red-900 flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Gemini AI provera nije izvršena</div>
                <div className="text-xs mt-1">{aiError}</div>
              </div>
            </div>
          )}

          {state.aiAuditReport ? (
            <div className="space-y-6">
              <section className="p-5 rounded-xl bg-white border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">
                    {state.aiAuditReport.mode === 'local-zero-token'
                      ? 'Lokalni izveštaj (0 AI tokena · 100% lokalno)'
                      : 'Gemini AI izveštaj (anonimizovani podaci)'}
                  </span>
                  <span className="font-mono">
                    Generisano: {formatDateTimeSr(state.aiAuditReport.generatedAt)}
                  </span>
                </div>
                <p className="text-sm text-slate-800 leading-relaxed">
                  {state.aiAuditReport.summary}
                </p>
              </section>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                <section className="p-5 rounded-xl bg-white border border-slate-200 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">
                    Detektovane anomalije ({state.aiAuditReport.anomalies.length})
                  </h3>
                  <div className="space-y-2.5">
                    {state.aiAuditReport.anomalies.map((anom, idx) => (
                      <div
                        key={idx}
                        className={`p-3.5 rounded-lg border text-xs space-y-1 ${
                          anom.severity === 'visok'
                            ? 'bg-red-50 border-red-200'
                            : anom.severity === 'srednji'
                            ? 'bg-amber-50 border-amber-200'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900">{anom.title}</span>
                          <span className="font-mono font-semibold text-slate-700">
                            Prioritet: {anom.severity}
                          </span>
                        </div>
                        <p className="text-slate-700">{anom.detail}</p>
                        <div className="text-slate-500 font-mono">
                          Entitet: {anom.affectedEntity}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="p-5 rounded-xl bg-white border border-slate-200 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">
                    Predlozi optimizacije rotacije (
                    {state.aiAuditReport.optimizationRecommendations.length})
                  </h3>
                  <div className="space-y-2.5">
                    {state.aiAuditReport.optimizationRecommendations.map((rec, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-lg bg-emerald-50/60 border border-emerald-200 text-xs space-y-1"
                      >
                        <div className="font-bold text-slate-900">{rec.title}</div>
                        <p className="text-slate-700">{rec.action}</p>
                        <div className="text-emerald-800 font-medium">
                          Očekivani efekat: {rec.estimatedBenefit}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          ) : (
            !aiError && (
              <div className="p-8 rounded-xl bg-white border border-slate-200 text-center text-sm text-slate-500">
                Izaberite „Lokalna provera (0 tokena)” za trenutnu privatnu analizu ili
                „Gemini provera (anonimizovano)” za dubinsku analizu bez slanja ličnih
                podataka.
              </div>
            )
          )}
        </div>
      )}

      {activeTab === 'qr-access' && (
        <div className="space-y-6">
          <ClientQrProvisioner
            tenantId={state.activeTenantId}
            pathwayToken={state.activePathwayToken}
            fleetPassphrase={state.fleetPassphrase}
            drivers={office.drivers}
            onUpdatePassphrase={updateFleetPassphrase}
          />

          <section className="p-5 rounded-xl bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 max-w-2xl">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <QrCode className="w-4 h-4 text-slate-700" />
                <span>Lokalna konfiguracija Desktop aplikacije</span>
              </h3>
              <p className="text-xs text-slate-600">
                Preuzmite lokalnu konfiguracionu datoteku za svoj Docker / Desktop trezor ili
                otvorite serversku stranicu za instalaciju na drugim dispečerskim računarima.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const payload = {
                    tenantId: state.activeTenantId,
                    pathwayPrefix: `/api/t/${state.activeTenantId}/gateway`,
                    pathwayToken: state.activePathwayToken,
                    localNote:
                      'Privatni E2EE ključ ostaje isključivo u lokalnom trezoru ovog računara.',
                  };
                  const blob = new Blob([JSON.stringify(payload, null, 2)], {
                    type: 'application/json',
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `zp-desktop-${state.activeTenantId.toLowerCase()}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-900 flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Izvezi konfiguraciju kanala (.json)</span>
              </button>

              <a
                href={apiUrl('/api/download/desktop/docker')}
                download
                className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Preuzmi Docker Desktop paket</span>
              </a>
            </div>
          </section>
        </div>
      )}

      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleSaveShift}
            className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editingShiftId ? 'Preraspodela smene' : 'Dodela nove smene'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                Zatvori
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Mašinovođa
                </label>
                <select
                  value={formDriverId}
                  onChange={(e) => setFormDriverId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
                >
                  {office.drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.status} · {d.currentStation})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Klijent operater
                </label>
                <input
                  type="text"
                  required
                  list="client-operator-list"
                  value={formOperator}
                  onChange={(e) => setFormOperator(e.target.value)}
                  placeholder="Naziv železničkog operatera"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
                />
                <datalist id="client-operator-list">
                  {knownOperators.map((op) => (
                    <option key={op} value={op} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Polazna stanica
                </label>
                <select
                  value={formFrom}
                  onChange={(e) => setFormFrom(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
                >
                  {STATIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Odredišna stanica
                </label>
                <select
                  value={formTo}
                  onChange={(e) => setFormTo(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
                >
                  {STATIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Broj voza
                </label>
                <input
                  type="text"
                  required
                  value={formTrain}
                  onChange={(e) => setFormTrain(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Lokomotiva
                </label>
                <input
                  type="text"
                  required
                  value={formLoco}
                  onChange={(e) => setFormLoco(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Početak smene
                </label>
                <input
                  type="datetime-local"
                  required
                  value={formStart}
                  onChange={(e) => setFormStart(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Završetak smene
                </label>
                <input
                  type="datetime-local"
                  required
                  value={formEnd}
                  onChange={(e) => setFormEnd(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono text-slate-900"
                />
              </div>
            </div>

            {liveEvaluation && (
              <div
                className={`p-3.5 rounded-xl border space-y-2 ${
                  liveEvaluation.allowed
                    ? 'bg-emerald-50 border-emerald-300'
                    : 'bg-red-50 border-red-300'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold">
                  <span
                    className={
                      liveEvaluation.allowed ? 'text-emerald-800' : 'text-red-800'
                    }
                  >
                    {liveEvaluation.allowed
                      ? 'Deterministički motor: Sva pravila ispunjena'
                      : 'BLOKADA ZAKONSKIH PRAVILA'}
                  </span>
                  <span className="font-mono text-slate-700">
                    Smena: {liveEvaluation.totalShiftHours}h · Vožnja:{' '}
                    {liveEvaluation.drivingHours}h
                  </span>
                </div>

                <ul className="space-y-1 text-xs">
                  {liveEvaluation.checks.map((c, idx) => (
                    <li
                      key={idx}
                      className={
                        c.passed ? 'text-emerald-900' : 'text-red-900 font-semibold'
                      }
                    >
                      {c.passed ? '✓' : '✕'} {c.ruleName}: {c.message}
                    </li>
                  ))}
                </ul>

                {!liveEvaluation.allowed && (
                  <div className="pt-2 border-t border-red-200 space-y-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-red-900 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={overrideEnabled}
                        onChange={(e) => setOverrideEnabled(e.target.checked)}
                        className="w-4 h-4 accent-red-700"
                      />
                      <ShieldAlert className="w-4 h-4 text-red-700" />
                      <span>
                        Aktiviraj Vanredno odobrenje (Force Majeure — beleži se kao
                        Vanredni prekovremeni)
                      </span>
                    </label>

                    {overrideEnabled && (
                      <textarea
                        rows={2}
                        required
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        placeholder="Obavezan pisani razlog za vanredno odobrenje..."
                        className="w-full p-2.5 rounded-lg border border-red-300 bg-white text-xs text-slate-900"
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            {formError && (
              <div className="text-xs font-semibold text-red-700">{formError}</div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Otkaži
              </button>
              <button
                type="submit"
                className={`px-4 py-2 rounded-lg text-xs font-semibold text-white cursor-pointer ${
                  liveEvaluation && !liveEvaluation.allowed
                    ? 'bg-red-700 hover:bg-red-600'
                    : 'bg-slate-900 hover:bg-slate-800'
                }`}
              >
                {liveEvaluation && !liveEvaluation.allowed
                  ? 'Sačuvaj uz vanredno odobrenje'
                  : 'Potvrdi i sačuvaj smenu'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
    </div>
  );
};
