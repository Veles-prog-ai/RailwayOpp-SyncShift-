import React, { useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../core/usePWAInstall';

export const PWAInstallButton = ({ tenantName }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
      >
        <Download className="w-4 h-4" />
        <span>Instaliraj aplikaciju na uređaj</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
      >
        <Smartphone className="w-4 h-4 text-amber-400" />
        <span>Instaliraj kao samostalnu aplikaciju</span>
      </button>

      {showGuide && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-5 space-y-3 text-slate-100 shadow-2xl">
            <h3 className="text-base font-bold">
              Instalacija aplikacije {tenantName ? `(${tenantName})` : ''}
            </h3>
            {isIOS ? (
              <p className="text-xs text-slate-300 leading-relaxed">
                1. Dodirnite dugme <strong>Share</strong> u donjoj traci Safari pregledača.
                <br />
                2. Izaberite <strong>Add to Home Screen</strong>.
                <br />
                3. Aplikacija će se pokretati samostalno bez trake pregledača, sa lokalnim E2EE skladištem.
              </p>
            ) : (
              <p className="text-xs text-slate-300 leading-relaxed">
                Otvorite meni pregledača (Chrome / Edge) i izaberite{' '}
                <strong>Instaliraj aplikaciju</strong> ili{' '}
                <strong>Add to Home screen</strong> da biste je spakovali kao namensku
                kabinsku aplikaciju.
              </p>
            )}
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full min-h-[44px] rounded-xl bg-amber-500 text-slate-950 font-bold text-xs cursor-pointer"
            >
              Zatvori uputstvo
            </button>
          </div>
        </div>
      )}
    </>
  );
};
