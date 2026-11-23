/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  ArrowUpRight,
  Globe,
  Monitor,
  RotateCcw,
  Server,
  Smartphone,
} from 'lucide-react';
import { SystemProvider, useSystem } from './core/store';
import { DriverMobileView } from './segments/driver-mobile/DriverMobileView';
import { ServerAdminView } from './segments/server-admin/ServerAdminView';
import { DispatcherDesktopView } from './segments/dispatcher-desktop/DispatcherDesktopView';
import { LandingServerView } from './segments/landing/LandingServerView';

const INSPECTION_CARDS = [
  {
    id: 'landing',
    title: 'Početna stranica (Server)',
    route: '/portal',
    serverHtmlRoute: '/landing',
    icon: Globe,
    accent: 'border-slate-300 bg-white',
    badge: 'Server Landing',
    summary:
      'Javna serverska stranica za preuzimanje Desktop paketa (Windows, Docker, Linux, macOS) i objašnjenje klijentske #fragment privatnosti.',
  },
  {
    id: 'mobile',
    title: 'Mobilna aplikacija (Mašinovođa)',
    route: '/mobile',
    icon: Smartphone,
    accent: 'border-slate-800 bg-slate-950 text-slate-100',
    badge: '390px Kabina (Dark)',
    summary:
      'Specijalizovana aplikacija za lokomotivsku kabinu sa Store-and-Forward redom, offline tunel režimom i primopredajom vozila.',
    dark: true,
  },
  {
    id: 'desktop',
    title: 'Upravni desktop (Dispečer)',
    route: '/desktop',
    icon: Monitor,
    accent: 'border-amber-300 bg-white',
    badge: 'Lokalni Trezor',
    summary:
      'Klijentski trezor operatera: planiranje smena, deterministički motor pravila, obračun za fakturisanje, lokalni QR generator i analiza.',
  },
  {
    id: 'admin',
    title: 'Server & Admin konzola',
    route: '/admin',
    icon: Server,
    accent: 'border-emerald-300 bg-white',
    badge: 'Servis Provajder',
    summary:
      'Upravljanje izolovanim putanjama klijenata (Pathway Token), HMAC generator licenci, API dnevnik i dijagnostika E2EE gateway-a.',
  },
];

function StudioInspectionHub() {
  const { state, purgeLocalData } = useSystem();

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-white border-b border-slate-200 px-4 sm:px-8 py-4">
        <div className="max-w-[1200px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-slate-500">
              Studio Inspekcija · Razdvojeni Segmenti
            </div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
              Železnički Pogon — Izbor segmenta za pregled
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-mono text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg">
              Aktivni kanal: {state.activeTenantId || 'Nije izabran'}
            </span>
            <button
              type="button"
              onClick={purgeLocalData}
              className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Očisti lokalni trezor</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-4 sm:px-8 py-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {INSPECTION_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <section
                key={card.id}
                className={`rounded-2xl border p-6 flex flex-col justify-between gap-6 shadow-xs ${card.accent}`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <Icon
                        className={`w-5 h-5 shrink-0 ${
                          card.dark ? 'text-amber-400' : 'text-slate-700'
                        }`}
                      />
                      <h2 className="text-base font-bold tracking-tight">
                        {card.title}
                      </h2>
                    </div>
                    <span
                      className={`text-[11px] font-mono font-semibold px-2.5 py-1 rounded-md border ${
                        card.dark
                          ? 'bg-slate-900 border-slate-700 text-amber-300'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      {card.badge}
                    </span>
                  </div>

                  <p
                    className={`text-sm leading-relaxed ${
                      card.dark ? 'text-slate-300' : 'text-slate-600'
                    }`}
                  >
                    {card.summary}
                  </p>

                  <div
                    className={`text-xs font-mono ${
                      card.dark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    Putanja: {card.route}
                    {card.serverHtmlRoute ? ` · Server HTML: ${card.serverHtmlRoute}` : ''}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <a
                    href={card.route}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                      card.dark
                        ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                        : 'bg-slate-900 hover:bg-slate-800 text-white'
                    }`}
                  >
                    Pregledaj segment
                  </a>

                  <a
                    href={card.route}
                    target="_blank"
                    rel="noreferrer"
                    className={`px-3.5 py-2.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                      card.dark
                        ? 'border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-100'
                        : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <span>Novi tab</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>

                  {card.serverHtmlRoute && (
                    <a
                      href={card.serverHtmlRoute}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <span>Serverski HTML</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2">
          <span>
            Svaki segment se otvara samostalno bez ugrađenog menija za prebacivanje uloga.
          </span>
          <span className="font-mono text-slate-700">
            Terminal promocija: INSPECT_SEGMENT=mobile|desktop|admin|landing
          </span>
        </div>
      </main>
    </div>
  );
}

function SegmentRouter() {
  const { state } = useSystem();

  if (state.activeSegment === 'landing') {
    return <LandingServerView />;
  }
  if (state.activeSegment === 'mobile') {
    return <DriverMobileView />;
  }
  if (state.activeSegment === 'admin') {
    return <ServerAdminView />;
  }
  if (state.activeSegment === 'desktop') {
    return <DispatcherDesktopView />;
  }

  return <StudioInspectionHub />;
}

export default function App() {
  return (
    <SystemProvider>
      <SegmentRouter />
    </SystemProvider>
  );
}
