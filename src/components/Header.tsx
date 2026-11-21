import React from 'react';
import { Download } from 'lucide-react';
import { MISSION_PROFILES } from '../engine/propulsionPhysics';
import { MissionProfileId, SystemStatus } from '../types/telemetry';

interface HeaderProps {
  missionId: MissionProfileId;
  onMissionChange: (id: MissionProfileId) => void;
  status: SystemStatus;
  elapsedSec: number;
  isRunning: boolean;
  sampleCount: number;
  onDownloadCsv: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  missionId,
  onMissionChange,
  status,
  elapsedSec,
  isRunning,
  sampleCount,
  onDownloadCsv,
}) => {
  const statusStyles: Record<
    SystemStatus,
    { text: string; border: string; bg: string; glyph: string }
  > = {
    NOMINAL: {
      text: 'text-[#06B6D4]',
      border: 'border-[#06B6D4]/40',
      bg: 'bg-[#06B6D4]/10',
      glyph: '●',
    },
    WARNING: {
      text: 'text-[#F59E0B]',
      border: 'border-[#F59E0B]/50',
      bg: 'bg-[#F59E0B]/10',
      glyph: '▲',
    },
    'CRITICAL FAULT': {
      text: 'text-[#EF4444]',
      border: 'border-[#EF4444]/60',
      bg: 'bg-[#EF4444]/15',
      glyph: '✖',
    },
  };

  const st = statusStyles[status];

  const formatMet = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remSec = sec % 60;
    return `T+${String(mins).padStart(2, '0')}:${remSec.toFixed(1).padStart(4, '0')}`;
  };

  return (
    <header className="w-full bg-[#111827] border-b border-[#1F2937] px-4 lg:px-6 py-3">
      <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Title Zone */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded bg-[#0B0F19] border border-[#1F2937] flex items-center justify-center shrink-0">
            <svg
              viewBox="0 0 24 24"
              className="w-4.5 h-4.5 text-[#06B6D4]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 2L8 9h8l-4-7z" />
              <path d="M9 9v5l-2 4h10l-2-4V9" />
              <path d="M10 21l2-3 2 3" />
            </svg>
          </div>
          <div className="min-w-0">
            <h1 className="text-base lg:text-lg font-semibold tracking-tight text-slate-100 leading-tight truncate">
              PropulSense AI
              <span className="hidden xl:inline font-normal text-slate-400">
                {' '}
                — Spacecraft Propulsion &amp; Transducer Telemetry Diagnostics
              </span>
            </h1>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums mt-0.5">
              <span>MET {formatMet(elapsedSec)}</span>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span>{isRunning ? '10 Hz Stream' : 'Stream Paused'}</span>
              <span aria-hidden="true" className="text-slate-600 hidden sm:inline">
                ·
              </span>
              <span className="hidden sm:inline">{sampleCount} samples</span>
            </div>
          </div>
        </div>

        {/* Controls & Status Zone */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* Mission Profile Selector */}
          <div className="flex items-center gap-2">
            <label
              htmlFor="mission-profile-select"
              className="text-xs text-slate-400 whitespace-nowrap hidden md:inline"
            >
              Mission Profile
            </label>
            <select
              id="mission-profile-select"
              value={missionId}
              onChange={(e) => onMissionChange(e.target.value as MissionProfileId)}
              className="bg-[#0B0F19] border border-[#1F2937] hover:border-slate-600 focus:border-[#06B6D4] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#06B6D4] text-slate-100 text-xs font-medium rounded px-3 py-2 cursor-pointer transition-colors"
            >
              {Object.values(MISSION_PROFILES).map((p) => (
                <option key={p.id} value={p.id} className="bg-[#111827] text-slate-100">
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Simulation Status Badge */}
          <div
            role="status"
            aria-live="polite"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded border font-mono text-xs font-semibold tracking-wide whitespace-nowrap shrink-0 ${st.bg} ${st.border} ${st.text}`}
          >
            <span aria-hidden="true">{st.glyph}</span>
            <span>{status}</span>
          </div>

          {/* Primary Action: CSV Export */}
          <button
            type="button"
            onClick={onDownloadCsv}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded bg-[#06B6D4] hover:bg-[#22D3EE] active:bg-[#0891B2] text-[#0B0F19] text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#06B6D4]"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Download Telemetry Report (CSV)</span>
          </button>
        </div>
      </div>
    </header>
  );
};
