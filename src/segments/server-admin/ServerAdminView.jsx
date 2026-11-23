import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Key,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Trash2,
} from 'lucide-react';
import { apiFetch, apiUrl } from '../../core/apiClient';
import { useSystem } from '../../core/store';
import { formatDateTimeSr } from '../../core/utils';

export const ServerAdminView = () => {
  const {
    state,
    gatewaySnapshot,
    syncError,
    switchTenant,
    triggerGatewaySync,
  } = useSystem();

  const [adminTab, setAdminTab] = useState('tenants');

  const [adminToken, setAdminToken] = useState(null);
  const [authStatus, setAuthStatus] = useState(null);
  const [authInput, setAuthInput] = useState('');
  const [authError, setAuthError] = useState(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);

  const [tenants, setTenants] = useState([]);
  const [licenses, setLicenses] = useState([]);
  const [apiLogs, setApiLogs] = useState([]);
  const [apiTenantFilter, setApiTenantFilter] = useState('ALL');
  const [diagnostics, setDiagnostics] = useState(null);
  const [selfTestResults, setSelfTestResults] = useState([]);

  const [newClientName, setNewClientName] = useState('');

  const [licTenantId, setLicTenantId] = useState(state.activeTenantId);
  const [licPlan, setLicPlan] = useState('Flota Pro');
  const [licMaxDrivers, setLicMaxDrivers] = useState(40);
  const [licDays, setLicDays] = useState(365);
  const [verifyKeyInput, setVerifyKeyInput] = useState('');
  const [verifyResult, setVerifyResult] = useState(null);

  const checkAuthStatus = useCallback(async () => {
    try {
      const resp = await apiFetch('/api/admin/auth/status');
      if (resp.ok) {
        const data = await resp.json();
        setAuthStatus(data);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void checkAuthStatus();
  }, [checkAuthStatus]);

  const adminFetch = useCallback(
    async (path, init = {}) => {
      const headers = {
        ...(init.headers || {}),
        'X-Admin-Token': adminToken || '',
      };
      const res = await apiFetch(path, { ...init, headers });
      if (res.status === 401 || res.status === 403) {
        setAdminToken(null);
        setAuthError('Administratorska sesija je nevažeća ili je istekla.');
      }
      return res;
    },
    [adminToken]
  );

  const fetchAdminData = useCallback(async () => {
    if (!adminToken) return;
    try {
      const [tResp, lResp, logResp, dResp] = await Promise.all([
        adminFetch('/api/admin/tenants'),
        adminFetch('/api/admin/licenses'),
        adminFetch(`/api/admin/api-logs?tenantId=${encodeURIComponent(apiTenantFilter)}`),
        adminFetch('/api/admin/diagnostics'),
      ]);
      if (tResp.ok) {
        const d = await tResp.json();
        const nextTenants = d.tenants || [];
        setTenants(nextTenants);
        setLicTenantId((prev) =>
          prev && nextTenants.some((t) => t.tenantId === prev)
            ? prev
            : nextTenants[0]?.tenantId || ''
        );
      }
      if (lResp.ok) {
        const d = await lResp.json();
        setLicenses(d.licenses || []);
      }
      if (logResp.ok) {
        const d = await logResp.json();
        setApiLogs(d.logs || []);
      }
      if (dResp.ok) {
        const d = await dResp.json();
        setDiagnostics(d);
      }
    } catch {
      // ignore fetch error
    }
  }, [adminFetch, adminToken, apiTenantFilter]);

  useEffect(() => {
    if (adminToken) {
      void fetchAdminData();
    }
  }, [fetchAdminData, adminTab, state.activeTenantId, adminToken]);

  const activeTenantObj =
    tenants.find((t) => t.tenantId === state.activeTenantId) || tenants[0];

  const handleLoginOrClaim = async (e) => {
    e.preventDefault();
    if (!authInput.trim()) return;
    setAuthError(null);
    setIsSubmittingAuth(true);

    const endpoint = authStatus?.requiresClaim
      ? '/api/admin/auth/claim'
      : '/api/admin/auth/login';

    const payload = authStatus?.requiresClaim
      ? { password: authInput.trim() }
      : { credential: authInput.trim() };

    try {
      const resp = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.token) {
        setAdminToken(data.token);
        setAuthInput('');
        setAuthError(null);
        await checkAuthStatus();
      } else {
        setAuthError(data.error || 'Neuspešna autorizacija.');
      }
    } catch {
      setAuthError('Greška pri povezivanju sa serverom.');
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleLogout = async () => {
    if (adminToken) {
      await apiFetch('/api/admin/auth/logout', {
        method: 'POST',
        headers: { 'X-Admin-Token': adminToken },
      }).catch(() => {});
    }
    setAdminToken(null);
    setTenants([]);
    setLicenses([]);
    setApiLogs([]);
    setDiagnostics(null);
    await checkAuthStatus();
  };

  const handleCreateTenant = async (e) => {
    e.preventDefault();
    if (!newClientName.trim()) return;
    const resp = await adminFetch('/api/admin/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientName: newClientName.trim() }),
    });
    if (resp.ok) {
      const data = await resp.json();
      setNewClientName('');
      await fetchAdminData();
      if (data.tenant) {
        switchTenant(data.tenant.tenantId, data.tenant.pathwayToken);
      }
    }
  };

  const handleRotateToken = async (tenantId) => {
    const resp = await adminFetch(
      `/api/admin/tenants/${encodeURIComponent(tenantId)}/rotate-token`,
      {
        method: 'POST',
      }
    );
    if (resp.ok) {
      const data = await resp.json();
      await fetchAdminData();
      if (data.tenant && data.tenant.tenantId === state.activeTenantId) {
        switchTenant(data.tenant.tenantId, data.tenant.pathwayToken);
      }
    }
  };

  const handleGenerateLicense = async (e) => {
    e.preventDefault();
    if (!licTenantId) return;
    const resp = await adminFetch('/api/admin/licenses/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: licTenantId,
        plan: licPlan,
        maxDrivers: licMaxDrivers,
        durationDays: licDays,
        modules: ['Mobilna kabina', 'Deterministički motor', 'E2EE Gateway', 'AI Kontrola'],
      }),
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.license?.licenseKey) {
        setVerifyKeyInput(data.license.licenseKey);
      }
      await fetchAdminData();
    }
  };

  const handleToggleLicense = async (licenseId) => {
    await adminFetch(`/api/admin/licenses/${encodeURIComponent(licenseId)}/toggle-status`, {
      method: 'POST',
    });
    await fetchAdminData();
    void triggerGatewaySync();
  };

  const handleVerifyLicense = async (e) => {
    e.preventDefault();
    const resp = await adminFetch('/api/admin/licenses/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: verifyKeyInput }),
    });
    if (resp.ok) {
      const data = await resp.json();
      setVerifyResult({ valid: data.valid, reason: data.reason });
    }
  };

  const handleRunSelfTest = async () => {
    const resp = await adminFetch('/api/admin/diagnostics/self-test', { method: 'POST' });
    if (resp.ok) {
      const data = await resp.json();
      setSelfTestResults(data.results || []);
      await fetchAdminData();
    }
  };

  const handlePurgeServer = async () => {
    const resp = await adminFetch('/api/admin/purge', { method: 'POST' });
    if (resp.ok) {
      setSelfTestResults([]);
      setVerifyResult(null);
      await fetchAdminData();
    }
  };

  if (!adminToken) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md p-8 rounded-2xl bg-slate-950 border border-slate-800 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-400">
              <Lock className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">
              {authStatus?.requiresClaim
                ? 'Prvo podešavanje administratora'
                : 'Servisni provajder · Admin prijava'}
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              {authStatus?.requiresClaim
                ? 'Unesite novu administratorsku lozinku (minimum 6 karaktera) da biste zaključali i osigurali konzolu servis provajdera.'
                : 'Unesite administratorsku lozinku ili API ključ za pristup konzoli provajdera.'}
            </p>
          </div>

          {authError && (
            <div className="p-3 rounded-xl bg-red-950/60 border border-red-800/80 text-xs text-red-200 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleLoginOrClaim} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {authStatus?.requiresClaim ? 'Nova administratorska lozinka' : 'Lozinka ili Admin API ključ'}
              </label>
              <input
                type="password"
                value={authInput}
                onChange={(e) => setAuthInput(e.target.value)}
                placeholder={authStatus?.requiresClaim ? 'Unesite lozinku (min 6 karaktera)...' : 'Unesite lozinku...'}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-500"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isSubmittingAuth}
              className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Key className="w-4 h-4" />
              <span>{authStatus?.requiresClaim ? 'Aktiviraj i zaključaj admin nalog' : 'Prijavi se u konzolu'}</span>
            </button>
          </form>

          <div className="pt-4 border-t border-slate-900 text-center text-xs text-slate-500">
            Zaštićeno Hashed scrypt-om i X-Admin-Token sesijom.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
    <div className="max-w-[1380px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Service Provider Header & Tenant Channel Selector */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Server className="w-4 h-4 text-slate-700" />
            <span>Železnički Pogon · Servis Provajder Admin Konzola</span>
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Provajder upravlja isključivo izolovanim putanjama, licencama, API
            evidencijom i dijagnostikom servera — bez uvida u vozni park, smene,
            telemetriju ili ključeve klijenata.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-semibold text-slate-700">
            Aktivni kanal klijenta:
          </label>
          <select
            value={state.activeTenantId}
            onChange={(e) => {
              const found = tenants.find((t) => t.tenantId === e.target.value);
              if (found) switchTenant(found.tenantId, found.pathwayToken);
            }}
            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-xs font-semibold text-slate-900"
          >
            {tenants.length === 0 ? (
              <option value="">Nema registrovanih klijenata</option>
            ) : (
              tenants.map((t) => (
                <option key={t.tenantId} value={t.tenantId}>
                  {t.clientName} ({t.tenantId})
                </option>
              ))
            )}
          </select>

          <button
            type="button"
            onClick={() => void fetchAdminData()}
            className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-xs font-semibold text-slate-800 flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Osveži</span>
          </button>

          <button
            type="button"
            onClick={() => void handlePurgeServer()}
            className="px-3 py-1.5 rounded-lg border border-red-300 hover:bg-red-50 text-xs font-semibold text-red-700 flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Isprazni server</span>
          </button>

          <button
            type="button"
            onClick={() => void handleLogout()}
            className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Odjava</span>
          </button>
        </div>
      </div>

      {/* Admin Console Sub-Tabs (Strictly Service Provider Tools Only) */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit">
        {[
          { id: 'tenants', label: 'Klijenti & Izolovane Putanje' },
          { id: 'licenses', label: 'Generator Licenci' },
          { id: 'gateway', label: 'API Log & E2EE Gateway' },
          { id: 'diagnostics', label: 'Dijagnostika Servera' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setAdminTab(t.id)}
            className={`px-3.5 py-2 rounded-md text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              adminTab === t.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {syncError && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-300 text-xs text-red-900 font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
          <span>{syncError}</span>
        </div>
      )}

      {/* TAB 1: MULTI-TENANT PATHWAY ISOLATION */}
      {adminTab === 'tenants' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <section className="lg:col-span-8 p-5 rounded-xl bg-white border border-slate-200 space-y-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-700" />
                <span>Izolovani klijentski kanali (Pathway Isolation)</span>
              </h2>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-3 font-semibold">Klijent / Tenant ID</th>
                      <th className="py-2 pr-3 font-semibold">Izolovana putanja</th>
                      <th className="py-2 pr-3 font-semibold">Licenca</th>
                      <th className="py-2 pr-3 font-semibold text-right">Red / ACK</th>
                      <th className="py-2 text-right font-semibold">Akcije</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tenants.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-500">
                          Server je čist — nema registrovanih klijenata. Dodajte prvog klijenta u formi desno za početak live testiranja.
                        </td>
                      </tr>
                    ) : (
                      tenants.map((t) => {
                        const isCurrent = t.tenantId === state.activeTenantId;
                        return (
                          <tr
                            key={t.tenantId}
                            className={isCurrent ? 'bg-slate-50 font-medium' : ''}
                          >
                            <td className="py-3 pr-3">
                              <div className="font-semibold text-slate-900">
                                {t.clientName}
                              </div>
                              <div className="font-mono text-[11px] text-slate-500">
                                {t.tenantId}
                              </div>
                            </td>
                            <td className="py-3 pr-3 font-mono text-[11px] text-slate-700">
                              <div>{t.pathwayPrefix}</div>
                              <div className="text-slate-400">
                                Token: {t.pathwayToken.slice(0, 12)}...
                              </div>
                            </td>
                            <td className="py-3 pr-3">
                              <span
                                className={`font-semibold ${
                                  t.licenseStatus === 'Aktivna'
                                    ? 'text-emerald-700'
                                    : 'text-red-700'
                                }`}
                              >
                                {t.licenseStatus}
                              </span>
                            </td>
                            <td className="py-3 pr-3 text-right font-mono tabular-nums">
                              {t.queuedCount || 0} / {t.ackedCount || 0}
                            </td>
                            <td className="py-3 text-right space-x-2 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => switchTenant(t.tenantId, t.pathwayToken)}
                                className={`px-2.5 py-1 rounded border text-[11px] font-semibold cursor-pointer ${
                                  isCurrent
                                    ? 'bg-slate-900 text-white border-slate-900'
                                    : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                {isCurrent ? 'Aktivan' : 'Aktiviraj'}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleRotateToken(t.tenantId)}
                                className="px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer"
                              >
                                Rotiraj token
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <form
              onSubmit={(e) => void handleCreateTenant(e)}
              className="lg:col-span-4 p-5 rounded-xl bg-white border border-slate-200 space-y-3"
            >
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-slate-700" />
                <span>Dodaj novog klijenta na server</span>
              </h3>
              <p className="text-xs text-slate-600">
                Automatski kreira odvojenu Gateway putanju, jedinstveni Pathway Token,
                izolovani bafer šifrovanih koverti i početnu probnu licencu.
              </p>
              <input
                type="text"
                required
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Naziv kompanije (npr. Cargo Express Niš)"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
              />
              <button
                type="submit"
                className="w-full py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
              >
                Kreiraj izolovani kanal klijenta
              </button>
            </form>
          </div>

          {activeTenantObj && (
            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <span>
                    Zero-Knowledge predaja Desktop aplikacije za: {activeTenantObj.clientName}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-500">
                  Putanja: {activeTenantObj.pathwayPrefix}
                </span>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Radi maksimalne poverljivosti klijenta, servis provajder na serveru izdaje
                samo izolovanu mrežnu putanju i Pathway Token. Operativno praćenje flote,
                smena i generisanje lokalnog QR linka za mašinovođe odvijaju se
                isključivo u klijentskom{' '}
                <span className="font-semibold text-slate-900">Upravnom desktopu</span>.
              </p>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <input
                  type="text"
                  readOnly
                  value={`${
                    typeof window !== 'undefined' ? window.location.origin : ''
                  }/desktop?tenant=${encodeURIComponent(
                    activeTenantObj.tenantId
                  )}&pathway=${encodeURIComponent(activeTenantObj.pathwayToken)}`}
                  aria-label="Desktop inicijalizacioni link klijenta"
                  className="flex-1 min-w-[240px] px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-[11px] text-slate-700"
                />
                <a
                  href={`/desktop?tenant=${encodeURIComponent(
                    activeTenantObj.tenantId
                  )}&pathway=${encodeURIComponent(activeTenantObj.pathwayToken)}`}
                  className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold whitespace-nowrap"
                >
                  Otvori Desktop klijenta
                </a>
                <a
                  href={apiUrl('/landing')}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-semibold whitespace-nowrap"
                >
                  Serverska stranica za preuzimanje
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: LICENSE GENERATOR & VERIFIER */}
      {adminTab === 'licenses' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <form
              onSubmit={(e) => void handleGenerateLicense(e)}
              className="lg:col-span-5 p-5 rounded-xl bg-white border border-slate-200 space-y-3.5"
            >
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Key className="w-4 h-4 text-slate-700" />
                <span>Generator kriptografskih licenci (HMAC-SHA256)</span>
              </h2>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Klijent (Tenant)
                </label>
                <select
                  value={licTenantId}
                  onChange={(e) => setLicTenantId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
                >
                  {tenants.map((t) => (
                    <option key={t.tenantId} value={t.tenantId}>
                      {t.clientName} ({t.tenantId})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Paket
                  </label>
                  <select
                    value={licPlan}
                    onChange={(e) => setLicPlan(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-xs text-slate-900"
                  >
                    <option value="Standard">Standard</option>
                    <option value="Flota Pro">Flota Pro</option>
                    <option value="Enterprise">Enterprise</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Maks. vozača
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={5000}
                    value={licMaxDrivers}
                    onChange={(e) => setLicMaxDrivers(Number(e.target.value))}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-xs font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Trajanje (dana)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1825}
                    value={licDays}
                    onChange={(e) => setLicDays(Number(e.target.value))}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-xs font-mono text-slate-900"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
              >
                Generiši i aktiviraj licencu
              </button>

              <div className="pt-3 border-t border-slate-200 space-y-2">
                <div className="text-xs font-bold text-slate-900">
                  Verifikacija ključa licence
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={verifyKeyInput}
                    onChange={(e) => setVerifyKeyInput(e.target.value)}
                    placeholder="ZP-PRO-TENANT-..."
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono text-xs text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={(e) => void handleVerifyLicense(e)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-xs font-semibold text-slate-800 cursor-pointer"
                  >
                    Proveri
                  </button>
                </div>
                {verifyResult && (
                  <div
                    className={`text-xs font-semibold ${
                      verifyResult.valid ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {verifyResult.reason}
                  </div>
                )}
              </div>
            </form>

            <section className="lg:col-span-7 p-5 rounded-xl bg-white border border-slate-200 space-y-3">
              <h3 className="text-base font-bold text-slate-900">
                Registar izdatih licenci ({licenses.length})
              </h3>
              <p className="text-xs text-slate-600">
                Opoziv licence odmah blokira pristup izolovanom Gateway kanalu klijenta
                (HTTP 403), dok lokalni podaci na uređajima ostaju netaknuti.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-3 font-semibold">Ključ licence</th>
                      <th className="py-2 pr-3 font-semibold">Klijent / Paket</th>
                      <th className="py-2 pr-3 font-semibold">Važi do</th>
                      <th className="py-2 pr-3 font-semibold">Status</th>
                      <th className="py-2 text-right font-semibold">Akcija</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {licenses.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-5 text-center text-slate-500">
                          Nema izdatih licenci. Kreirajte klijenta i generišite HMAC licencu.
                        </td>
                      </tr>
                    ) : (
                      licenses.map((lic) => (
                        <tr key={lic.licenseId}>
                          <td className="py-2.5 pr-3 font-mono font-semibold text-slate-900">
                            {lic.licenseKey}
                          </td>
                          <td className="py-2.5 pr-3">
                            <div className="font-semibold text-slate-800">
                              {lic.clientName}
                            </div>
                            <div className="text-slate-500">
                              {lic.plan} · do {lic.maxDrivers} vozača
                            </div>
                          </td>
                          <td className="py-2.5 pr-3 font-mono text-slate-600">
                            {new Date(lic.expiresAt).toLocaleDateString('sr-Latn-RS')}
                          </td>
                          <td className="py-2.5 pr-3 font-semibold">
                            <span
                              className={
                                lic.status === 'active'
                                  ? 'text-emerald-700'
                                  : 'text-red-700'
                              }
                            >
                              {lic.status === 'active' ? 'Aktivna' : 'Opozvana'}
                            </span>
                          </td>
                          <td className="py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => void handleToggleLicense(lic.licenseId)}
                              className={`px-2.5 py-1 rounded border text-[11px] font-semibold cursor-pointer ${
                                lic.status === 'active'
                                  ? 'border-red-300 text-red-700 hover:bg-red-50'
                                  : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                              }`}
                            >
                              {lic.status === 'active' ? 'Opozovi' : 'Aktiviraj'}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* TAB 3: API LOG & BLIND E2EE GATEWAY RELAY (NO CLIENT SECRETS OR TRACKING) */}
      {adminTab === 'gateway' && (
        <div className="space-y-6">
          <section className="p-5 rounded-xl bg-white border border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  E2EE Gateway Bafer ({state.activeTenantId || 'Nije izabran kanal'})
                </h2>
                <p className="text-xs text-slate-600">
                  Server vidi isključivo nečitljive AES-256-GCM koverte i metapodatke
                  isporuke (ACK / Rolling Window), bez uvida u sadržaj ili ključeve.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void fetchAdminData()}
                className="px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Osveži bafer</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-slate-500">Na čekanju za kabinu</div>
                <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900">
                  {gatewaySnapshot.queuedMobile}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-slate-500">Na čekanju za desktop</div>
                <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900">
                  {gatewaySnapshot.queuedOffice}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-slate-500">Potvrđeno (ACK prozor)</div>
                <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900">
                  {gatewaySnapshot.ackedRollingCount} / {gatewaySnapshot.rollingWindowLimit}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-slate-500">Privatnost sadržaja</div>
                <div className="mt-1 text-sm font-bold text-emerald-700">
                  Zero-Knowledge
                </div>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <th className="py-2 px-3 font-semibold">Smer</th>
                    <th className="py-2 px-3 font-semibold">Seq</th>
                    <th className="py-2 px-3 font-semibold">Veličina</th>
                    <th className="py-2 px-3 font-semibold">Šifrovani zapis (Ciphertext)</th>
                    <th className="py-2 px-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  {gatewaySnapshot.envelopes.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-4 px-3 text-center font-sans text-slate-500">
                        Nema koverti u baferu za {state.activeTenantId}.
                      </td>
                    </tr>
                  ) : (
                    gatewaySnapshot.envelopes.map((env) => (
                      <tr key={env.id}>
                        <td className="py-2 px-3 text-slate-800">
                          {env.sourceNode === 'mobile' ? 'Mobilni → Kanc.' : 'Kanc. → Mobilni'}
                        </td>
                        <td className="py-2 px-3">#{env.seq}</td>
                        <td className="py-2 px-3">{env.payloadBytes} B</td>
                        <td className="py-2 px-3 text-slate-500">{env.cipherPreview}</td>
                        <td className="py-2 px-3 font-sans font-semibold">
                          {env.status === 'acked' ? (
                            <span className="text-emerald-700">Potvrđeno (ACK)</span>
                          ) : (
                            <span className="text-amber-700">Čeka ACK</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="p-5 rounded-xl bg-white border border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-slate-700" />
                <span>API Dnevnik servera (Server API Log)</span>
              </h2>

              <select
                value={apiTenantFilter}
                onChange={(e) => setApiTenantFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-800"
              >
                <option value="ALL">Svi kanali i pozivi</option>
                {tenants.map((t) => (
                  <option key={t.tenantId} value={t.tenantId}>
                    Samo {t.tenantId}
                  </option>
                ))}
                <option value="SERVICE-ADMIN">Samo Admin pozivi</option>
              </select>
            </div>

            <div className="overflow-x-auto max-h-[360px] overflow-y-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2 px-3 font-semibold">Vreme</th>
                    <th className="py-2 px-3 font-semibold">Metod</th>
                    <th className="py-2 px-3 font-semibold">Putanja</th>
                    <th className="py-2 px-3 font-semibold">Klijent / Kanal</th>
                    <th className="py-2 px-3 font-semibold text-right">Status</th>
                    <th className="py-2 px-3 font-semibold text-right">Vreme</th>
                    <th className="py-2 px-3 font-semibold">Napomena</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  {apiLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2 px-3 text-slate-500 whitespace-nowrap">
                        {formatDateTimeSr(log.timestamp)}
                      </td>
                      <td className="py-2 px-3 font-semibold text-slate-900">{log.method}</td>
                      <td className="py-2 px-3 text-slate-700">{log.path}</td>
                      <td className="py-2 px-3 text-slate-800">{log.tenantId}</td>
                      <td
                        className={`py-2 px-3 text-right font-semibold ${
                          log.statusCode >= 400 ? 'text-red-700' : 'text-emerald-700'
                        }`}
                      >
                        {log.statusCode}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-600">
                        {log.latencyMs}ms
                      </td>
                      <td className="py-2 px-3 font-sans text-slate-600">{log.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* TAB 4: SERVER DIAGNOSTICS */}
      {adminTab === 'diagnostics' && (
        <div className="space-y-6">
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-white border border-slate-200">
              <div className="text-xs text-slate-500">Runtime / Uptime</div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
                {diagnostics ? `${diagnostics.uptimeSeconds}s` : '—'}
              </div>
              <div className="text-xs text-slate-600 font-mono mt-1">
                {diagnostics ? `${diagnostics.nodeVersion} · ${diagnostics.platform}` : ''}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200">
              <div className="text-xs text-slate-500">Memorija procesa (RSS / Heap)</div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
                {diagnostics
                  ? `${diagnostics.memoryRssMb} / ${diagnostics.memoryHeapUsedMb} MB`
                  : '—'}
              </div>
              <div className="text-xs text-slate-600 mt-1">
                Zero-knowledge in-memory bafer
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200">
              <div className="text-xs text-slate-500">Izolovani kanali / Licence</div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
                {diagnostics
                  ? `${diagnostics.activeTenants} / ${diagnostics.activeLicenses}`
                  : '—'}
              </div>
              <div className="text-xs text-slate-600 mt-1">
                Koverte: {diagnostics?.totalQueuedEnvelopes ?? 0} red ·{' '}
                {diagnostics?.totalAckedEnvelopes ?? 0} ACK
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200">
              <div className="text-xs text-slate-500">Kripto & Gemini status</div>
              <div className="mt-1 text-xl font-bold font-mono text-slate-900">
                {diagnostics?.hmacEngineReady ? 'HMAC Spreman' : 'Greška'}
              </div>
              <div className="text-xs text-slate-600 mt-1">
                Gemini ključ: {diagnostics?.hasGeminiKey ? 'Podešen' : 'Nije podešen'}
              </div>
            </div>
          </section>

          <section className="p-5 rounded-xl bg-white border border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-slate-700" />
                  <span>Dijagnostički test izolacije putanja i kriptografije</span>
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Proverava odvojenost klijentskih bafera, HMAC potpise licenci i
                  zero-knowledge pravila Gateway-a.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void handleRunSelfTest()}
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Pokreni dijagnostiku</span>
              </button>
            </div>

            {selfTestResults.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {selfTestResults.map((res, idx) => (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-lg border text-xs space-y-1 ${
                      res.ok
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-red-50 border-red-200 text-red-900'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{res.check}</span>
                    </div>
                    <p>{res.detail}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
    </div>
  );
};
