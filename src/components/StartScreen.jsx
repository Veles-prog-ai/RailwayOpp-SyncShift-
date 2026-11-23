import React, { useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  KeyRound,
  Lock,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';

export const StartScreen = ({
  mode,
  tenantId,
  pathwayToken,
  fleetPassphrase,
  onConfirmAndStart,
}) => {
  const isMobile = mode === 'mobile';
  const [tenantInput, setTenantInput] = useState(tenantId);
  const [tokenInput, setTokenInput] = useState(pathwayToken);
  const [keyInput, setKeyInput] = useState(fleetPassphrase);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [activeDocTab, setActiveDocTab] = useState('privacy');

  const handleGenerateLocalKey = () => {
    const bytes = new Uint8Array(9);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    setKeyInput(`ZP-LOKAL-${hex.toUpperCase()}`);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!policyAccepted) {
      setErrorMsg('Potvrdite da ste pročitali Politiku privatnosti i Uputstvo za korišćenje.');
      return;
    }
    if (tenantInput.trim() && !tokenInput.trim()) {
      setErrorMsg('Unesite Pathway Token za izabrani klijentski kanal.');
      return;
    }
    if (tenantInput.trim() && !isMobile && keyInput.trim().length < 4) {
      setErrorMsg('Unesite ili generišite lokalni E2EE ključ (min. 4 karaktera).');
      return;
    }
    onConfirmAndStart({
      tenantId: tenantInput.trim(),
      pathwayToken: tokenInput.trim(),
      fleetPassphrase: keyInput.trim(),
    });
  };

  return (
    <div
      className={
        isMobile
          ? 'flex-1 overflow-y-auto p-4 bg-slate-950 text-slate-100 space-y-4'
          : 'max-w-[960px] mx-auto px-4 sm:px-6 py-8 space-y-6'
      }
    >
      {/* Header */}
      <div
        className={`p-5 rounded-2xl border space-y-2 ${
          isMobile
            ? 'bg-slate-900 border-slate-800'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex items-center gap-2.5">
          {isMobile ? (
            <Smartphone className="w-5 h-5 text-amber-400 shrink-0" />
          ) : (
            <Monitor className="w-5 h-5 text-slate-800 shrink-0" />
          )}
          <h1
            className={`text-base sm:text-xl font-bold tracking-tight ${
              isMobile ? 'text-slate-50' : 'text-slate-900'
            }`}
          >
            {isMobile
              ? 'Mobilna kabina — Početni ekran'
              : 'Upravni desktop — Početni ekran i podešavanje trezora'}
          </h1>
        </div>
        <p
          className={`text-xs sm:text-sm leading-relaxed ${
            isMobile ? 'text-slate-300' : 'text-slate-600'
          }`}
        >
          {isMobile
            ? 'Specijalizovana aplikacija za mašinovođe sa lokalnim čuvanjem smena, vožnji i radom u tunelima bez signala.'
            : 'Lokalni klijentski trezor za planiranje smena, obračun sati, flotu i generisanje personalizovanih QR linkova.'}
        </p>
      </div>

      {/* Tabbed Privacy Policy + User Guide */}
      <div
        className={`rounded-2xl border overflow-hidden ${
          isMobile
            ? 'bg-slate-900 border-slate-800'
            : 'bg-white border-slate-200'
        }`}
      >
        <div
          className={`grid grid-cols-2 border-b ${
            isMobile ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveDocTab('privacy')}
            className={`py-3 px-4 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
              activeDocTab === 'privacy'
                ? isMobile
                  ? 'bg-slate-900 text-amber-400 border-b-2 border-amber-400'
                  : 'bg-white text-slate-900 border-b-2 border-slate-900'
                : isMobile
                ? 'text-slate-400 hover:text-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Politika privatnosti</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveDocTab('guide')}
            className={`py-3 px-4 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
              activeDocTab === 'guide'
                ? isMobile
                  ? 'bg-slate-900 text-amber-400 border-b-2 border-amber-400'
                  : 'bg-white text-slate-900 border-b-2 border-slate-900'
                : isMobile
                ? 'text-slate-400 hover:text-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            <span>Uputstvo za korišćenje</span>
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-3 text-xs sm:text-sm leading-relaxed">
          {activeDocTab === 'privacy' ? (
            <ul className="space-y-2.5">
              <li className="flex items-start gap-2.5">
                <Lock
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    isMobile ? 'text-emerald-400' : 'text-emerald-700'
                  }`}
                />
                <span>
                  <strong>Isključivo lokalno čuvanje podataka:</strong> Svi podaci o
                  mašinovođama, smenama, službenim vozilima i obračunu sati čuvaju se
                  lokalno na vašem uređaju. Centralni server ne poseduje bazu podataka
                  klijenta.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <KeyRound
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    isMobile ? 'text-emerald-400' : 'text-emerald-700'
                  }`}
                />
                <span>
                  <strong>End-to-End šifrovanje (AES-256-GCM):</strong> Razmena poruka i
                  evidencija između Desktopa i mobilnih uređaja prolazi kroz serverski
                  gateway isključivo u šifrovanom obliku. Vaš ključ nikada ne napušta vaše
                  uređaje.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <ShieldCheck
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    isMobile ? 'text-emerald-400' : 'text-emerald-700'
                  }`}
                />
                <span>
                  <strong>Zaštita linkova (#fragment) i bez praćenja lokacije:</strong>{' '}
                  Lokalni QR link koristi <span className="font-mono">#e2ee=</span>{' '}
                  fragment koji pregledač ne šalje serveru. Aplikacija ne prikuplja GPS
                  telemetriju u pozadini — upisuju se samo podaci koje mašinovođa ručno
                  potvrdi.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    isMobile ? 'text-emerald-400' : 'text-emerald-700'
                  }`}
                />
                <span>
                  <strong>Opciona anonimizovana AI provera:</strong> Lokalna analiza radi sa
                  0 tokena bez interneta. Slanje ka Gemini servisu vrši se samo na zahtev
                  dispečera, bez ličnih imena i brojeva telefona.
                </span>
              </li>
            </ul>
          ) : isMobile ? (
            <ol className="space-y-2.5 list-decimal list-inside">
              <li>
                <strong>Povezivanje kabine:</strong> Skenirajte personalizovani QR kod sa
                dispečerskog Desktopa ili unesite Tenant ID, Pathway Token i E2EE ključ
                ispod.
              </li>
              <li>
                <strong>Smene i obavezni odmor:</strong> U tabu <em>Smene</em> pratite
                segmente rada (priprema, vuča, čekanje, rasprema) i preostali zakonski
                odmor.
              </li>
              <li>
                <strong>Aktivna vožnja i tuneli:</strong> U tabu <em>Vožnja</em> beležite
                početak/kraj smene, prolazna vremena i zastoje. Kada nema signala, uključite{' '}
                <em>Tunel (Offline)</em> — zapisi se automatski šalju po povratku mreže.
              </li>
              <li>
                <strong>Vozila i hitne poruke:</strong> U tabu <em>Vozila</em> prijavite
                preuzimanje ili predaju službenog automobila, a u tabu <em>Poruke</em>{' '}
                potvrdite prijem instrukcija dispečera.
              </li>
            </ol>
          ) : (
            <ol className="space-y-2.5 list-decimal list-inside">
              <li>
                <strong>Povezivanje kanala:</strong> U Admin konzoli kreirajte izolovani
                kanal klijenta, zatim unesite dobijeni Tenant ID, Pathway Token i svoj
                lokalni E2EE ključ ispod (ili otvorite direktan link iz Admin konzole).
              </li>
              <li>
                <strong>Unos flote i mašinovođa:</strong> U tabu{' '}
                <em>Plan vožnje i Raspored</em> dodajte svoje mašinovođe, a u tabu{' '}
                <em>Flota, Motor &amp; Audit</em> dodajte službena vozila kompanije.
              </li>
              <li>
                <strong>Raspored i deterministički motor:</strong> Dodeljujte smene uz
                automatsku proveru zakonskog odmora, trajanja vožnje i preklapanja (sa
                opcijom vanrednog odobrenja uz pisani razlog).
              </li>
              <li>
                <strong>QR povezivanje kabine:</strong> U tabu{' '}
                <em>Povezivanje kabine (QR)</em> generišite lokalni QR kod za svakog
                mašinovođu bez otkrivanja ključa serveru.
              </li>
            </ol>
          )}
        </div>
      </div>

      {/* Live Channel Configuration Form */}
      <form
        onSubmit={handleSubmit}
        className={`p-4 sm:p-5 rounded-2xl border space-y-4 ${
          isMobile
            ? 'bg-slate-900 border-slate-800'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="space-y-1">
          <h2
            className={`text-sm sm:text-base font-bold ${
              isMobile ? 'text-slate-100' : 'text-slate-900'
            }`}
          >
            Povezivanje na izolovani kanal (opciono odmah ili naknadno)
          </h2>
          <p
            className={`text-xs ${
              isMobile ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            {isMobile
              ? 'Podaci se automatski popunjavaju kada otvorite personalizovani QR link sa dispečerskog Desktopa.'
              : 'Možete odmah povezati kanal sa servera ili nastaviti samo lokalno pa kasnije povezati E2EE gateway.'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label
              className={`block font-medium mb-1 ${
                isMobile ? 'text-slate-300' : 'text-slate-700'
              }`}
            >
              Tenant ID (kanal klijenta)
            </label>
            <input
              type="text"
              value={tenantInput}
              onChange={(e) => setTenantInput(e.target.value)}
              placeholder="npr. TENANT-FIRMA-A1B"
              className={`w-full px-3 py-2.5 rounded-xl border font-mono text-xs ${
                isMobile
                  ? 'bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-600'
                  : 'bg-white border-slate-300 text-slate-900'
              }`}
            />
          </div>

          <div>
            <label
              className={`block font-medium mb-1 ${
                isMobile ? 'text-slate-300' : 'text-slate-700'
              }`}
            >
              Pathway Token
            </label>
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="pw_..."
              className={`w-full px-3 py-2.5 rounded-xl border font-mono text-xs ${
                isMobile
                  ? 'bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-600'
                  : 'bg-white border-slate-300 text-slate-900'
              }`}
            />
          </div>
        </div>

        <div className="text-xs space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label
              className={`font-medium ${
                isMobile ? 'text-slate-300' : 'text-slate-700'
              }`}
            >
              Lokalni E2EE ključ za šifrovanje (ostaje na vašem uređaju)
            </label>
            {!isMobile && (
              <button
                type="button"
                onClick={handleGenerateLocalKey}
                className="px-2.5 py-1 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-800 flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Generiši ključ</span>
              </button>
            )}
          </div>
          <input
            type={isMobile ? 'password' : 'text'}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="Unesite ili generišite lokalni ključ flote..."
            className={`w-full px-3 py-2.5 rounded-xl border font-mono text-xs ${
              isMobile
                ? 'bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-600'
                : 'bg-white border-slate-300 text-slate-900'
            }`}
          />
        </div>

        <label
          className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs cursor-pointer ${
            isMobile
              ? 'bg-slate-950 border-slate-800 text-slate-200'
              : 'bg-slate-50 border-slate-200 text-slate-800'
          }`}
        >
          <input
            type="checkbox"
            checked={policyAccepted}
            onChange={(e) => setPolicyAccepted(e.target.checked)}
            className="w-4 h-4 mt-0.5 accent-amber-500 shrink-0"
          />
          <span>
            Pročitao sam i prihvatam <strong>Politiku privatnosti</strong> i{' '}
            <strong>Uputstvo za korišćenje</strong> lokalnog trezora.
          </span>
        </label>

        {errorMsg && (
          <div
            className={`text-xs font-semibold ${
              isMobile ? 'text-red-400' : 'text-red-700'
            }`}
          >
            {errorMsg}
          </div>
        )}

        <button
          type="submit"
          className={`w-full min-h-[46px] rounded-xl font-bold text-sm transition-colors cursor-pointer ${
            isMobile
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
              : 'bg-slate-900 hover:bg-slate-800 text-white'
          }`}
        >
          {isMobile ? 'Otvori Mobilnu kabinu' : 'Pokreni Upravni desktop'}
        </button>
      </form>
    </div>
  );
};
