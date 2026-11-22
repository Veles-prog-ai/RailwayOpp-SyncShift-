import React, { useState } from 'react';
import {
  ArrowRight,
  Container,
  Download,
  ExternalLink,
  KeyRound,
  Monitor,
  QrCode,
  ShieldCheck,
  Smartphone,
  Terminal,
} from 'lucide-react';
import { useSystem } from '../../core/store';

interface DownloadPackageItem {
  id: 'windows' | 'docker' | 'linux' | 'mac';
  title: string;
  subtitle: string;
  fileLabel: string;
  href: string;
  icon: 'monitor' | 'docker' | 'terminal';
}

const DESKTOP_PACKAGES: DownloadPackageItem[] = [
  {
    id: 'windows',
    title: 'Windows 10 / 11 Desktop',
    subtitle:
      'Samostalna dispečerska aplikacija sa lokalnim čuvanjem podataka i direktnom vezom ka serveru.',
    fileLabel: 'Preuzmi za Windows (.cmd)',
    href: '/api/download/desktop/windows',
    icon: 'monitor',
  },
  {
    id: 'docker',
    title: 'Docker Office Vault (Preporučeno)',
    subtitle:
      'Kontejnersko rešenje za stalni rad dispečerske kancelarije i privatnu bazu na serveru firme.',
    fileLabel: 'Preuzmi Docker Compose (.yml)',
    href: '/api/download/desktop/docker',
    icon: 'docker',
  },
  {
    id: 'linux',
    title: 'Linux Desktop (.desktop)',
    subtitle:
      'Instalaciona skripta za Ubuntu, Debian i Fedora radne stanice sa sistemskom prečicom.',
    fileLabel: 'Preuzmi za Linux (.sh)',
    href: '/api/download/desktop/linux',
    icon: 'terminal',
  },
  {
    id: 'mac',
    title: 'macOS Desktop',
    subtitle:
      'Direktni pokretač Upravnog desktopa za Apple radne stanice bez dodatnog podešavanja.',
    fileLabel: 'Preuzmi za macOS (.command)',
    href: '/api/download/desktop/mac',
    icon: 'monitor',
  },
];

export const LandingServerView: React.FC = () => {
  const { setActiveSegment, state } = useSystem();
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [deskImgFailed, setDeskImgFailed] = useState(false);
  const [lastDownloaded, setLastDownloaded] = useState<string | null>(null);

  const serverOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'https://server.local';

  const scrollToDownloads = () => {
    const el = document.getElementById('preuzimanje-desktop');
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="bg-slate-50 text-slate-900">
      {/* 1. HERO SECTION */}
      <section className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-10 pb-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="text-xs font-medium text-slate-500 flex flex-wrap items-center gap-2">
                <span>Železnička logistika</span>
                <span aria-hidden="true">·</span>
                <span>Lokalni trezor podataka</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{serverOrigin}</span>
              </div>

              <h1
                className="text-3xl sm:text-5xl font-bold tracking-tight text-slate-900 leading-[1.1]"
                style={{ textWrap: 'balance' }}
              >
                Upravljanje mašinovođama bez čuvanja poverljivih podataka na serveru
              </h1>

              <p className="text-base text-slate-600 leading-relaxed max-w-[60ch]">
                Hibridni sistem za privatne železničke operatere i uslužno ustupanje
                mašinovođa. Evidencija smena, obračun sati i kriptografski ključevi
                ostaju na vašem Upravnom desktopu, dok server služi isključivo kao
                šifrovani gateway.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={scrollToDownloads}
                className="px-5 py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Preuzmi Desktop aplikaciju</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSegment('dispatcher')}
                className="px-4 py-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-900 text-sm font-semibold flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
              >
                <span>Otvori Upravni desktop</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="lg:col-span-6">
            {heroImgFailed ? (
              <div className="w-full h-full min-h-[260px] rounded-2xl border border-slate-200 bg-slate-900 text-slate-100 p-8 flex flex-col justify-end">
                <div className="text-sm font-semibold">
                  Koridor Beograd Centar – Lapovo – Niš – Dimitrovgrad
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Hibridna E2EE sinhronizacija za teretne železničke operatere
                </div>
              </div>
            ) : (
              <img
                src="/src/assets/images/hero_rail_corridor_1795389175108.jpg"
                alt="Električna teretna lokomotiva na železničkom koridoru u zoru"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgFailed(true)}
                className="w-full h-full min-h-[260px] max-h-[420px] rounded-2xl border border-slate-200 object-cover"
              />
            )}
          </div>
        </div>
      </section>

      {/* 2. DESKTOP APP DOWNLOAD HUB */}
      <section
        id="preuzimanje-desktop"
        className="border-t border-slate-200 bg-white py-14"
      >
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            <div className="lg:col-span-7 space-y-6">
              <div className="space-y-2">
                <h2
                  className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900"
                  style={{ textWrap: 'balance' }}
                >
                  Preuzimanje Upravnog desktopa sa servera
                </h2>
                <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-[65ch]">
                  Svaki paket se preuzima direktno sa ovog servera i automatski povezuje
                  na vašu izolovanu putanju, bez naknadnog ručnog podešavanja mreže.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {DESKTOP_PACKAGES.map((pkg) => (
                  <div
                    key={pkg.id}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                        {pkg.icon === 'docker' ? (
                          <Container className="w-4 h-4 text-slate-700 shrink-0" />
                        ) : pkg.icon === 'terminal' ? (
                          <Terminal className="w-4 h-4 text-slate-700 shrink-0" />
                        ) : (
                          <Monitor className="w-4 h-4 text-slate-700 shrink-0" />
                        )}
                        <span>{pkg.title}</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {pkg.subtitle}
                      </p>
                    </div>

                    <a
                      href={pkg.href}
                      download
                      onClick={() => setLastDownloaded(pkg.title)}
                      className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{pkg.fileLabel}</span>
                    </a>
                  </div>
                ))}
              </div>

              {lastDownloaded && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-medium">
                  Preuzimanje paketa „{lastDownloaded}” je pokrenuto direktno sa servera.
                  Nakon pokretanja, otvorite odeljak „Povezivanje kabine (QR)” radi
                  generisanja lokalnog sigurnog linka za vaše mašinovođe.
                </div>
              )}
            </div>

            <div className="lg:col-span-5">
              {deskImgFailed ? (
                <div className="w-full h-full min-h-[260px] rounded-2xl border border-slate-200 bg-slate-900 text-slate-100 p-6 flex flex-col justify-end">
                  <div className="text-sm font-semibold">
                    Lokalni dispečerski trezor
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Radi lokalno i kada kancelarija ostane bez interneta
                  </div>
                </div>
              ) : (
                <img
                  src="/src/assets/images/desktop_dispatch_station_1795389175983.jpg"
                  alt="Moderna dispečerska radna stanica železničkog operatera"
                  referrerPolicy="no-referrer"
                  onError={() => setDeskImgFailed(true)}
                  className="w-full h-full min-h-[260px] rounded-2xl border border-slate-200 object-cover"
                />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 3. ZERO-KNOWLEDGE LOCAL QR & SECURE LINK ARCHITECTURE */}
      <section className="border-t border-slate-200 bg-slate-50 py-14">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 space-y-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-2 max-w-2xl">
              <h2
                className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900"
                style={{ textWrap: 'balance' }}
              >
                Personalizovani QR kod i lokalni sigurni link generišu se kod klijenta
              </h2>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                Da bismo garantovali potpunu poverljivost podataka svakog operatera,
                server nikada ne pravi mobilne pristupne linkove sa vašim ključem
                šifrovanja. To radi isključivo vaš Desktop program.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setActiveSegment('dispatcher')}
              className="px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <QrCode className="w-4 h-4" />
              <span>Generiši QR na Upravnom desktopu</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-xl bg-white border border-slate-200 space-y-2">
              <div className="text-xs font-mono font-bold text-amber-700">
                01. PERSONALIZACIJA NA DESKTOPU
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Poseban QR kod za svakog klijenta i mašinovođu
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Dispečer u svom lokalnom Desktop programu bira klijentski kanal (
                <span className="font-mono">{state.activeTenantId}</span>) i konkretnog
                mašinovođu, čime se aplikacija na telefonu automatski vezuje za pravi
                profil i rutu.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-white border border-slate-200 space-y-2">
              <div className="text-xs font-mono font-bold text-amber-700">
                02. LOKALNI SIGURNI LINK (#FRAGMENT)
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Ključ za dešifrovanje ne putuje kroz mrežu servera
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Generisani link koristi hash fragment (<span className="font-mono">#e2ee=...</span>
                ) koji internet pregledač zadržava lokalno na uređaju i nikada ga ne
                šalje ka serveru niti upisuje u serverske logove.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-white border border-slate-200 space-y-2">
              <div className="text-xs font-mono font-bold text-amber-700">
                03. SPECIJALIZOVANA KABINSKA INSTALACIJA
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Samostalna aplikacija za rad u tunelima bez signala
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Posle skeniranja QR koda, telefon instalira specijalizovani tamni režim
                za kabinu sa Store-and-Forward redom i lokalnom proverom radnog
                vremena.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. SYSTEM SEGMENTS LAUNCHER */}
      <section className="border-t border-slate-200 bg-white py-14">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Povezana celina iz 3 nezavisna segmenta
            </h2>
            <a
              href="/landing"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-slate-700 hover:text-slate-900 inline-flex items-center gap-1.5 underline underline-offset-4"
            >
              <span>Otvori čistu serversku stranicu (/landing)</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between gap-4">
              <div className="space-y-2">
                <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-slate-700" />
                  <span>Upravni desktop (Dispečer)</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Lokalni trezor operatera, planiranje smena, obračun za fakturisanje i
                  lokalni generator personalizovanih QR kodova za mašinovođe.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSegment('dispatcher')}
                className="py-2 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold text-left flex items-center justify-between cursor-pointer"
              >
                <span>Pokreni Upravni desktop</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between gap-4">
              <div className="space-y-2">
                <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-slate-700" />
                  <span>Mobilna aplikacija (Mašinovođa)</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Tamni noćni režim za lokomotivsku kabinu, evidencija vožnje, predaja
                  službenih vozila i offline sinhronizacija po izlasku iz tunela.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSegment('mobile')}
                className="py-2 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-900 text-xs font-semibold text-left flex items-center justify-between cursor-pointer"
              >
                <span>Otvori Kabinski prikaz</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between gap-4">
              <div className="space-y-2">
                <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-slate-700" />
                  <span>Server & Admin konzola</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Alat servis provajdera za izolovane putanje klijenata, generator HMAC
                  licenci, API evidenciju i dijagnostiku E2EE gateway-a.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSegment('admin')}
                className="py-2 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-900 text-xs font-semibold text-left flex items-center justify-between cursor-pointer"
              >
                <span>Otvori Admin konzolu</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 5. QUIET FOOTER */}
      <footer className="border-t border-slate-200 bg-slate-50 py-8">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-slate-600" />
            <span>
              Železnički Pogon · Hibridni lokalni trezor i izolovani E2EE gateway
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/landing" className="hover:text-slate-900 underline underline-offset-2">
              Serverski HTML (/landing)
            </a>
            <a href="/api/health" className="hover:text-slate-900 underline underline-offset-2">
              Provera servera
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
