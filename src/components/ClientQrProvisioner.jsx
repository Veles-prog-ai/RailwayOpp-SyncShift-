import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  Download,
  KeyRound,
  Lock,
  QrCode,
  RefreshCw,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';

export const ClientQrProvisioner = ({
  tenantId,
  pathwayToken,
  fleetPassphrase,
  drivers,
  onUpdatePassphrase,
}) => {
  const [selectedDriverId, setSelectedDriverId] = useState('ALL');
  const [linkMode, setLinkMode] = useState('local-fragment');
  const [passphraseInput, setPassphraseInput] = useState(fleetPassphrase);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setPassphraseInput(fleetPassphrase);
  }, [fleetPassphrase]);

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://app.example.com';

  const selectedDriver = drivers.find((d) => d.id === selectedDriverId);

  const driverParam =
    selectedDriverId !== 'ALL' ? `&driver=${encodeURIComponent(selectedDriverId)}` : '';

  const installUrl =
    linkMode === 'local-fragment'
      ? `${origin}/mobile?tenant=${encodeURIComponent(
          tenantId
        )}&pathway=${encodeURIComponent(pathwayToken)}${driverParam}#e2ee=${encodeURIComponent(
          fleetPassphrase
        )}`
      : `${origin}/mobile?tenant=${encodeURIComponent(
          tenantId
        )}&pathway=${encodeURIComponent(pathwayToken)}${driverParam}&lock=1`;

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(installUrl, {
      width: 240,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [installUrl]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(installUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleDownloadQrPng = () => {
    if (!qrDataUrl) return;
    const suffix = selectedDriver ? selectedDriver.id : 'kompanija';
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `qr-kabina-${tenantId.toLowerCase()}-${suffix}.png`;
    a.click();
  };

  const handleGenerateLocalKey = () => {
    const bytes = new Uint8Array(9);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    const nextKey = `ZP-LOKAL-${hex.toUpperCase()}`;
    setPassphraseInput(nextKey);
    onUpdatePassphrase(nextKey);
  };

  const handleApplyPassphrase = (e) => {
    e.preventDefault();
    if (passphraseInput.trim().length >= 4) {
      onUpdatePassphrase(passphraseInput.trim());
    }
  };

  return (
    <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <QrCode className="w-4 h-4 text-slate-700" />
            <span>Lokalni generator personalizovanog QR koda i sigurnog linka</span>
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Generiše se isključivo u lokalnom trezoru Upravnog desktopa — server nikada ne
            vidi vaš privatni E2EE ključ niti personalizovane linkove.
          </p>
        </div>
        <span className="text-xs font-mono text-slate-600">
          Klijent: {tenantId || 'Nije povezan'}
        </span>
      </div>

      {(!tenantId || !pathwayToken || !fleetPassphrase) && (
        <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-900 font-medium">
          Pre generisanja aktivnog QR koda, povežite Tenant ID i Pathway Token (kroz Početni ekran ili Admin konzolu) i unesite lokalni E2EE ključ flote ispod.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Personalization & Local Key Controls */}
        <div className="lg:col-span-7 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Personalizacija za mašinovođu
              </label>
              <select
                value={selectedDriverId}
                onChange={(e) => setSelectedDriverId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900"
              >
                <option value="ALL">Opšti link firme (svi mašinovođe)</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.licenseCode} · {d.homeStation})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Režim prenosa lokalnog ključa
              </label>
              <select
                value={linkMode}
                onChange={(e) => setLinkMode(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900"
              >
                <option value="local-fragment">
                  Lokalni sigurni link (#fragment van HTTP-a)
                </option>
                <option value="strict-split">
                  Podeljena tajna (bez ključa u QR kodu)
                </option>
              </select>
            </div>
          </div>

          <form
            onSubmit={handleApplyPassphrase}
            className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="font-semibold text-slate-900 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-slate-700" />
                <span>Lokalni E2EE ključ flote (ostaje samo na vašim uređajima)</span>
              </label>
              <button
                type="button"
                onClick={handleGenerateLocalKey}
                className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-800 flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Novi lokalni ključ</span>
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={passphraseInput}
                onChange={(e) => setPassphraseInput(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-xs text-slate-900"
              />
              <button
                type="submit"
                className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold whitespace-nowrap cursor-pointer"
              >
                Primeni ključ
              </button>
            </div>
          </form>

          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
              {linkMode === 'local-fragment' ? (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <span>Lokalni sigurni link sa #fragment zaštitom</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 text-amber-700" />
                  <span>Podeljena tajna: vozač ručno unosi E2EE ključ u kabini</span>
                </>
              )}
            </div>
            <p className="text-slate-600 leading-relaxed">
              {linkMode === 'local-fragment'
                ? 'Deo linka nakon znaka # (hash fragment) internet pregledač nikada ne šalje HTTP serveru, pa server ne može videti niti zapisati vaš E2EE ključ.'
                : 'QR kod sadrži samo izolovanu putanju klijenta i profil mašinovođe. E2EE ključ saopštavate vozaču usmeno ili internim kanalom.'}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <input
                type="text"
                readOnly
                value={installUrl}
                aria-label="Personalizovani lokalni sigurni link"
                className="flex-1 min-w-[200px] px-2.5 py-2 rounded-lg border border-slate-300 bg-white font-mono text-[11px] text-slate-700"
              />
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Kopirano' : 'Kopiraj link'}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
            <span className="flex items-center gap-1 font-medium text-slate-800">
              <UserCheck className="w-3.5 h-3.5 text-emerald-700" />
              <span>
                Profil: {selectedDriver ? selectedDriver.name : 'Svi mašinovođe kompanije'}
              </span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">Kanal: /api/t/{tenantId}/gateway</span>
          </div>
        </div>

        {/* Right: Scannable QR Preview & PNG Export */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`Personalizovani QR kod za ${
                selectedDriver ? selectedDriver.name : tenantId
              }`}
              className="w-52 h-52 rounded-lg border border-slate-300 bg-white p-2"
            />
          ) : (
            <div className="w-52 h-52 rounded-lg border border-slate-300 bg-white flex items-center justify-center text-xs text-slate-500">
              Generisanje QR koda...
            </div>
          )}

          <div className="text-center space-y-0.5">
            <div className="text-xs font-bold text-slate-900">
              {selectedDriver ? selectedDriver.name : `Flota ${tenantId}`}
            </div>
            <div className="text-[11px] text-slate-500">
              {linkMode === 'local-fragment'
                ? 'Brza instalacija jednim skeniranjem (#e2ee lokalno)'
                : 'Zahteva unos E2EE ključa u mobilnoj kabini'}
            </div>
          </div>

          <button
            type="button"
            onClick={handleDownloadQrPng}
            disabled={!qrDataUrl}
            className="w-full py-2 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-50 text-xs font-semibold text-slate-900 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Sačuvaj QR sliku (.png)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
