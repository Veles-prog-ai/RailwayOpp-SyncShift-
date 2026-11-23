/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { RotateCcw } from 'lucide-react';
import { SystemProvider, useSystem } from './core/store';
import { DriverMobileView } from './segments/driver-mobile/DriverMobileView';
import { ServerAdminView } from './segments/server-admin/ServerAdminView';
import { DispatcherDesktopView } from './segments/dispatcher-desktop/DispatcherDesktopView';
import { LandingServerView } from './segments/landing/LandingServerView';

const SEGMENTS = [
  { id: 'landing', label: 'Početna (Server)' },
  { id: 'mobile', label: 'Mobilna aplikacija (Mašinovođa)' },
  { id: 'admin', label: 'Server & Admin konzola' },
  { id: 'dispatcher', label: 'Upravni desktop (Dispečer)' },
];

function WorkspaceShell() {
  const { state, setActiveSegment, purgeLocalData } = useSystem();
  const isCabDark = state.activeSegment === 'mobile';

  return (
    <div
      className={`min-h-screen transition-colors ${
        isCabDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* 3-Zone Top Bar Contract */}
      <header
        className={`sticky top-0 z-40 h-16 px-4 sm:px-6 border-b flex items-center justify-between gap-8 ${
          isCabDark
            ? 'bg-slate-900 border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Zone 1: Brand Wordmark */}
        <div className="text-base sm:text-lg font-bold tracking-tight whitespace-nowrap shrink-0">
          Železnički Pogon
        </div>

        {/* Zone 2: View / Role Switcher */}
        <nav
          aria-label="Izbor segmenta sistema"
          className={`flex items-center gap-1 p-1 rounded-lg overflow-x-auto ${
            isCabDark ? 'bg-slate-950 border border-slate-800' : 'bg-slate-100'
          }`}
        >
          {SEGMENTS.map((seg) => {
            const active = state.activeSegment === seg.id;
            return (
              <button
                key={seg.id}
                type="button"
                onClick={() => setActiveSegment(seg.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? isCabDark
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-white text-slate-900 shadow-sm'
                    : isCabDark
                    ? 'text-slate-300 hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {seg.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single Primary Utility Action */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={purgeLocalData}
            className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              isCabDark
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                : 'bg-slate-900 hover:bg-slate-800 text-white'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Očisti lokalno</span>
          </button>
        </div>
      </header>

      {/* Active Segment Viewport */}
      {state.activeSegment === 'landing' && <LandingServerView />}
      {state.activeSegment === 'mobile' && <DriverMobileView />}
      {state.activeSegment === 'admin' && <ServerAdminView />}
      {state.activeSegment === 'dispatcher' && <DispatcherDesktopView />}
    </div>
  );
}

export default function App() {
  return (
    <SystemProvider>
      <WorkspaceShell />
    </SystemProvider>
  );
}
