import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  DiagnosticLogEntry,
  FaultSeverity,
  TelemetrySample,
} from '../types/telemetry';

interface DiagnosticsPanelProps {
  latestSample: TelemetrySample;
  logs: DiagnosticLogEntry[];
  onClearLogs: () => void;
}

type LogFilter = 'ALL' | FaultSeverity;

export const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = ({
  latestSample,
  logs,
  onClearLogs,
}) => {
  const [filter, setFilter] = useState<LogFilter>('ALL');

  const score = latestSample.healthScore;
  const gaugeColor =
    score >= 86 ? '#06B6D4' : score >= 65 ? '#F59E0B' : '#EF4444';

  const statusMeta =
    latestSample.status === 'NOMINAL'
      ? { glyph: '●', label: 'NOMINAL', color: 'text-[#06B6D4]' }
      : latestSample.status === 'WARNING'
      ? { glyph: '▲', label: 'WARNING', color: 'text-[#F59E0B]' }
      : { glyph: '✖', label: 'CRITICAL FAULT', color: 'text-[#EF4444]' };

  // SVG semi-circular arc gauge geometry
  const radius = 56;
  const circumference = Math.PI * radius;
  const dashOffset = circumference * (1 - score / 100);

  const filteredLogs =
    filter === 'ALL' ? logs : logs.filter((l) => l.severity === filter);

  const severityTone = (sev: FaultSeverity) => {
    if (sev === 'CRITICAL') return { glyph: '✖', color: 'text-[#EF4444]' };
    if (sev === 'WARNING') return { glyph: '▲', color: 'text-[#F59E0B]' };
    return { glyph: '●', color: 'text-[#06B6D4]' };
  };

  return (
    <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
      {/* Left: AI Anomaly Health Score & Statistical Residuals */}
      <div className="xl:col-span-4 bg-[#111827] border border-[#1F2937] rounded-md p-4 flex flex-col justify-between gap-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-100">
              AI Anomaly Health Score
            </h2>
            <span
              className={`font-mono text-xs font-semibold ${statusMeta.color}`}
            >
              {statusMeta.glyph} {statusMeta.label}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Physics-model residual &amp; Z-score transducer integrity index
          </p>
        </div>

        {/* Semi-Circular SVG Gauge */}
        <div className="flex flex-col items-center justify-center py-1">
          <svg
            viewBox="0 0 144 88"
            className="w-44 h-auto"
            role="img"
            aria-label={`Anomaly health score ${score} percent`}
          >
            {/* Background track arc */}
            <path
              d="M 16 74 A 56 56 0 0 1 128 74"
              fill="none"
              stroke="#1F2937"
              strokeWidth="10"
              strokeLinecap="butt"
            />
            {/* Active value arc */}
            <path
              d="M 16 74 A 56 56 0 0 1 128 74"
              fill="none"
              stroke={gaugeColor}
              strokeWidth="10"
              strokeLinecap="butt"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 180ms ease, stroke 180ms ease' }}
            />
            <text
              x="72"
              y="62"
              textAnchor="middle"
              fill="#F8FAFC"
              fontSize="26"
              fontFamily="JetBrains Mono, monospace"
              fontWeight="700"
            >
              {score}%
            </text>
            <text
              x="72"
              y="78"
              textAnchor="middle"
              fill="#94A3B8"
              fontSize="9"
              fontFamily="JetBrains Mono, monospace"
            >
              HEALTH INDEX
            </text>
          </svg>
        </div>

        {/* Live Residual & Z-Score Breakdown */}
        <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-[#1F2937]">
          <div className="bg-[#0B0F19] border border-[#1F2937] rounded p-2.5">
            <div className="text-[11px] text-slate-400">Pressure Residual</div>
            <div
              className={`font-mono tabular-nums text-sm font-semibold mt-0.5 ${
                Math.abs(latestSample.pressureResidualBar) > 0.85
                  ? 'text-[#EF4444]'
                  : 'text-slate-100'
              }`}
            >
              {latestSample.pressureResidualBar >= 0 ? '+' : ''}
              {latestSample.pressureResidualBar.toFixed(2)} bar
            </div>
          </div>

          <div className="bg-[#0B0F19] border border-[#1F2937] rounded p-2.5">
            <div className="text-[11px] text-slate-400">Z-Score Deviation</div>
            <div
              className={`font-mono tabular-nums text-sm font-semibold mt-0.5 ${
                Math.abs(latestSample.pressureZScore) > 3.0
                  ? 'text-[#EF4444]'
                  : Math.abs(latestSample.pressureZScore) > 1.9
                  ? 'text-[#F59E0B]'
                  : 'text-[#06B6D4]'
              }`}
            >
              {latestSample.pressureZScore >= 0 ? '+' : ''}
              {latestSample.pressureZScore.toFixed(2)} σ
            </div>
          </div>

          <div className="bg-[#0B0F19] border border-[#1F2937] rounded p-2.5">
            <div className="text-[11px] text-slate-400">Mass Flow Residual</div>
            <div
              className={`font-mono tabular-nums text-sm font-semibold mt-0.5 ${
                Math.abs(latestSample.massFlowResidualGs) > 0.6
                  ? 'text-[#F59E0B]'
                  : 'text-slate-100'
              }`}
            >
              {latestSample.massFlowResidualGs >= 0 ? '+' : ''}
              {latestSample.massFlowResidualGs.toFixed(2)} g/s
            </div>
          </div>

          <div className="bg-[#0B0F19] border border-[#1F2937] rounded p-2.5">
            <div className="text-[11px] text-slate-400">Valve Actuation Lag</div>
            <div
              className={`font-mono tabular-nums text-sm font-semibold mt-0.5 ${
                latestSample.effectiveLatencyMs > 30
                  ? 'text-[#EF4444]'
                  : 'text-slate-100'
              }`}
            >
              {latestSample.effectiveLatencyMs.toFixed(0)} ms
            </div>
          </div>
        </div>
      </div>

      {/* Right: Automated Fault Classification Log */}
      <div className="xl:col-span-8 bg-[#111827] border border-[#1F2937] rounded-md p-4 flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1F2937]">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Automated Fault Classification Log
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Real-time subsystem fault isolation, root-cause diagnostics, and corrective directives
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Severity Filter Segmented Control */}
            <div
              className="flex items-center gap-1 p-1 bg-[#0B0F19] border border-[#1F2937] rounded"
              role="group"
              aria-label="Filter diagnostic log by severity"
            >
              {(['ALL', 'CRITICAL', 'WARNING', 'INFO'] as LogFilter[]).map(
                (tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setFilter(tab)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-xs transition-colors cursor-pointer whitespace-nowrap ${
                      filter === tab
                        ? 'bg-[#1F2937] text-slate-100'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab === 'ALL'
                      ? `All (${logs.length})`
                      : tab.charAt(0) + tab.slice(1).toLowerCase()}
                  </button>
                )
              )}
            </div>

            <button
              type="button"
              onClick={onClearLogs}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#0B0F19] hover:bg-slate-800 border border-[#1F2937] text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
              title="Clear diagnostic log entries"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          </div>
        </div>

        {/* Log Entries List */}
        <div className="telemetry-scroll mt-3 max-h-[296px] overflow-y-auto divide-y divide-[#1F2937] pr-1">
          {filteredLogs.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              No diagnostic events match the selected severity filter. Inject a fault scenario or adjust propulsion controls to evaluate anomaly classification.
            </div>
          ) : (
            filteredLogs.map((entry) => {
              const tone = severityTone(entry.severity);
              return (
                <article key={entry.id} className="py-3 first:pt-1 last:pb-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono tabular-nums text-slate-400">
                    <span className={`font-semibold ${tone.color}`}>
                      {tone.glyph} {entry.severity}
                    </span>
                    <span aria-hidden="true" className="text-slate-600">
                      ·
                    </span>
                    <span className="text-slate-300">{entry.faultCode}</span>
                    <span aria-hidden="true" className="text-slate-600">
                      ·
                    </span>
                    <span>{entry.subsystem}</span>
                    <span aria-hidden="true" className="text-slate-600">
                      ·
                    </span>
                    <span>{entry.timestamp}</span>
                    <span aria-hidden="true" className="text-slate-600">
                      ·
                    </span>
                    <span>T+{entry.elapsedSec.toFixed(1)}s</span>
                  </div>

                  <h3 className="text-xs sm:text-sm font-semibold text-slate-100 leading-snug">
                    {entry.title}
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs leading-relaxed pt-0.5">
                    <p className="text-slate-400">
                      <span className="text-slate-300 font-medium">Root Cause: </span>
                      {entry.rootCause}
                    </p>
                    <p className="text-slate-400">
                      <span className="text-[#06B6D4] font-medium">Action: </span>
                      {entry.correctiveAction}
                    </p>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
};
