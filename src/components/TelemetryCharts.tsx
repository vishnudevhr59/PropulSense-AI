import React, { useMemo, useState } from 'react';
import {
  FilterMethod,
  MissionProfileConfig,
  TelemetrySample,
} from '../types/telemetry';
import { formatUtcTime } from '../engine/propulsionPhysics';

interface TelemetryChartsProps {
  samples: TelemetrySample[];
  profile: MissionProfileConfig;
  showRawSignal: boolean;
  onToggleRawSignal: (show: boolean) => void;
  filterMethod: FilterMethod;
}

const CHART_W = 860;
const CHART_H = 232;
const PAD = { top: 18, right: 56, bottom: 28, left: 54 };
const PLOT_W = CHART_W - PAD.left - PAD.right;
const PLOT_H = CHART_H - PAD.top - PAD.bottom;

function buildPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  return points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
}

export const TelemetryCharts: React.FC<TelemetryChartsProps> = ({
  samples,
  profile,
  showRawSignal,
  onToggleRawSignal,
  filterMethod,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const count = samples.length;
  const activeIdx =
    hoverIndex !== null && hoverIndex >= 0 && hoverIndex < count
      ? hoverIndex
      : count - 1;
  const activeSample = samples[activeIdx] ?? samples[samples.length - 1];

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (count < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * CHART_W;
    const norm = Math.max(0, Math.min(1, (relX - PAD.left) / PLOT_W));
    const idx = Math.round(norm * (count - 1));
    setHoverIndex(idx);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  const xForIndex = (i: number) => {
    if (count <= 1) return PAD.left + PLOT_W;
    return PAD.left + (i / (count - 1)) * PLOT_W;
  };

  // --- CHART 1: Pressures (bar) ---
  const pMax = 26;
  const yForPressure = (val: number) =>
    PAD.top + PLOT_H - (Math.max(0, Math.min(pMax, val)) / pMax) * PLOT_H;

  const pressurePaths = useMemo(() => {
    const tankPts: { x: number; y: number }[] = [];
    const modelPts: { x: number; y: number }[] = [];
    const rawPts: { x: number; y: number }[] = [];
    const filtPts: { x: number; y: number }[] = [];

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const x = xForIndex(i);
      tankPts.push({ x, y: yForPressure(s.tankPressureBar) });
      modelPts.push({ x, y: yForPressure(s.chamberPressureModelBar) });
      rawPts.push({ x, y: yForPressure(s.chamberPressureRawBar) });
      const filteredVal =
        filterMethod === 'kalman'
          ? s.chamberPressureKalmanBar
          : s.chamberPressureEmaBar;
      filtPts.push({ x, y: yForPressure(filteredVal) });
    }

    return {
      tank: buildPath(tankPts),
      model: buildPath(modelPts),
      raw: buildPath(rawPts),
      filtered: buildPath(filtPts),
    };
  }, [samples, filterMethod]);

  const pressureTicks = [0, 5, 10, 15, 20, 25];
  const safeMaxY = yForPressure(profile.safePcMaxBar);
  const safeMinY = yForPressure(profile.safePcMinBar);

  // --- CHART 2: Nozzle Temp (°C) & Mass Flow (g/s) ---
  const tempMax = profile.id === 'geo-440n' ? 1600 : 1050;
  const flowMax = profile.id === 'geo-440n' ? 180 : 14;

  const yForTemp = (val: number) =>
    PAD.top + PLOT_H - (Math.max(0, Math.min(tempMax, val)) / tempMax) * PLOT_H;
  const yForFlow = (val: number) =>
    PAD.top + PLOT_H - (Math.max(0, Math.min(flowMax, val)) / flowMax) * PLOT_H;

  const thermalFlowPaths = useMemo(() => {
    const tempPts: { x: number; y: number }[] = [];
    const flowMeasPts: { x: number; y: number }[] = [];
    const flowExpPts: { x: number; y: number }[] = [];

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const x = xForIndex(i);
      tempPts.push({ x, y: yForTemp(s.nozzleTempC) });
      flowMeasPts.push({ x, y: yForFlow(s.massFlowMeasuredGs) });
      flowExpPts.push({ x, y: yForFlow(s.massFlowExpectedGs) });
    }

    return {
      temp: buildPath(tempPts),
      flowMeas: buildPath(flowMeasPts),
      flowExp: buildPath(flowExpPts),
    };
  }, [samples, tempMax, flowMax]);

  const tempTicks =
    profile.id === 'geo-440n'
      ? [0, 400, 800, 1200, 1600]
      : [0, 250, 500, 750, 1000];
  const flowTicks =
    profile.id === 'geo-440n'
      ? [0, 45, 90, 135, 180]
      : [0, 3.5, 7.0, 10.5, 14.0];

  const safeTempY = yForTemp(profile.safeTempLimitC);

  // Shared X-axis time ticks (5 evenly spaced timestamps)
  const xTicks = useMemo(() => {
    if (count < 2) return [];
    const steps = 4;
    const ticks: { x: number; label: string }[] = [];
    for (let k = 0; k <= steps; k++) {
      const idx = Math.round((k / steps) * (count - 1));
      const s = samples[idx];
      ticks.push({
        x: xForIndex(idx),
        label: `T+${s.elapsedSec.toFixed(1)}s`,
      });
    }
    return ticks;
  }, [samples, count]);

  const crosshairX = hoverIndex !== null ? xForIndex(activeIdx) : null;
  const activeFilteredPc = activeSample
    ? filterMethod === 'kalman'
      ? activeSample.chamberPressureKalmanBar
      : activeSample.chamberPressureEmaBar
    : 0;

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* CHART 1: Chamber Pressure & Tank Pressure */}
      <section className="bg-[#111827] border border-[#1F2937] rounded-md p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Chamber Pressure &amp; Tank Pressure Telemetry
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-slate-400 mt-1">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-[#06B6D4] inline-block" />
                P<sub>c</sub> {filterMethod === 'kalman' ? 'Kalman' : 'EMA'}
              </span>
              {showRawSignal && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-[#F59E0B]/75 inline-block" />
                  P<sub>c</sub> Raw IDPT
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-[#60A5FA] inline-block" />
                Tank Pressure
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 border-t border-dashed border-slate-400 inline-block" />
                Physics Model
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 border-t border-dashed border-[#EF4444]/80 inline-block" />
                Safe P<sub>c</sub> Limits ({profile.safePcMinBar}–{profile.safePcMaxBar} bar)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {activeSample && (
              <div className="hidden md:flex items-center gap-3 bg-[#0B0F19] border border-[#1F2937] rounded px-2.5 py-1 text-[11px] font-mono tabular-nums">
                <span className="text-slate-400">
                  {hoverIndex !== null ? formatUtcTime(activeSample.timestampMs) : 'LIVE'}
                </span>
                <span className="text-[#60A5FA]">
                  Tank {activeSample.tankPressureBar.toFixed(2)}b
                </span>
                <span className="text-[#06B6D4]">
                  Filt {activeFilteredPc.toFixed(2)}b
                </span>
                {showRawSignal && (
                  <span className="text-[#F59E0B]">
                    Raw {activeSample.chamberPressureRawBar.toFixed(2)}b
                  </span>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => onToggleRawSignal(!showRawSignal)}
              className={`px-2.5 py-1 rounded border text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                showRawSignal
                  ? 'bg-[#06B6D4]/12 border-[#06B6D4]/60 text-[#06B6D4]'
                  : 'bg-[#0B0F19] border-[#1F2937] text-slate-400 hover:text-slate-200'
              }`}
            >
              {showRawSignal ? 'Raw Signal: Visible' : 'Raw Signal: Hidden'}
            </button>
          </div>
        </div>

        <div className="w-full bg-[#0B0F19] border border-[#1F2937] rounded overflow-hidden">
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            className="w-full h-auto block cursor-crosshair select-none"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            role="img"
            aria-label="Synchronized Chamber Pressure and Tank Pressure time-series chart"
          >
            {/* Upper Safety Band (above safePcMaxBar up to pMax, subtle boundary) */}
            <rect
              x={PAD.left}
              y={PAD.top}
              width={PLOT_W}
              height={Math.max(0, safeMaxY - PAD.top)}
              fill="#EF4444"
              fillOpacity="0.045"
            />
            {/* Lower Safety Band (below safePcMinBar) */}
            <rect
              x={PAD.left}
              y={safeMinY}
              width={PLOT_W}
              height={Math.max(0, PAD.top + PLOT_H - safeMinY)}
              fill="#F59E0B"
              fillOpacity="0.05"
            />

            {/* Horizontal Gridlines & Y-Axis Labels */}
            {pressureTicks.map((t) => {
              const y = yForPressure(t);
              return (
                <g key={t}>
                  <line
                    x1={PAD.left}
                    y1={y}
                    x2={PAD.left + PLOT_W}
                    y2={y}
                    stroke="#1F2937"
                    strokeWidth="1"
                  />
                  <text
                    x={PAD.left - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    fill="#94A3B8"
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {t}
                  </text>
                </g>
              );
            })}

            {/* Y-Axis Unit Label */}
            <text
              x={14}
              y={PAD.top + PLOT_H / 2}
              textAnchor="middle"
              fill="#64748B"
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
              transform={`rotate(-90 14 ${PAD.top + PLOT_H / 2})`}
            >
              PRESSURE (bar)
            </text>

            {/* Safety Threshold Dashed Lines */}
            <line
              x1={PAD.left}
              y1={safeMaxY}
              x2={PAD.left + PLOT_W}
              y2={safeMaxY}
              stroke="#EF4444"
              strokeOpacity="0.65"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <text
              x={PAD.left + PLOT_W - 4}
              y={safeMaxY - 4}
              textAnchor="end"
              fill="#EF4444"
              fillOpacity="0.85"
              fontSize="9"
              fontFamily="JetBrains Mono, monospace"
            >
              MAX SAFE Pc ({profile.safePcMaxBar.toFixed(1)} bar)
            </text>

            <line
              x1={PAD.left}
              y1={safeMinY}
              x2={PAD.left + PLOT_W}
              y2={safeMinY}
              stroke="#F59E0B"
              strokeOpacity="0.6"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <text
              x={PAD.left + PLOT_W - 4}
              y={safeMinY - 4}
              textAnchor="end"
              fill="#F59E0B"
              fillOpacity="0.85"
              fontSize="9"
              fontFamily="JetBrains Mono, monospace"
            >
              MIN SAFE Pc ({profile.safePcMinBar.toFixed(1)} bar)
            </text>

            {/* X-Axis Ticks */}
            {xTicks.map((tick, idx) => (
              <g key={idx}>
                <line
                  x1={tick.x}
                  y1={PAD.top}
                  x2={tick.x}
                  y2={PAD.top + PLOT_H}
                  stroke="#1F2937"
                  strokeOpacity="0.55"
                  strokeWidth="1"
                />
                <text
                  x={tick.x}
                  y={CHART_H - 8}
                  textAnchor="middle"
                  fill="#64748B"
                  fontSize="9.5"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {tick.label}
                </text>
              </g>
            ))}

            {/* Data Traces */}
            <path
              d={pressurePaths.tank}
              fill="none"
              stroke="#60A5FA"
              strokeWidth="1.75"
              strokeLinejoin="round"
            />
            <path
              d={pressurePaths.model}
              fill="none"
              stroke="#94A3B8"
              strokeOpacity="0.7"
              strokeWidth="1.25"
              strokeDasharray="3 3"
              strokeLinejoin="round"
            />
            {showRawSignal && (
              <path
                d={pressurePaths.raw}
                fill="none"
                stroke="#F59E0B"
                strokeOpacity="0.62"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            )}
            <path
              d={pressurePaths.filtered}
              fill="none"
              stroke="#06B6D4"
              strokeWidth="2.2"
              strokeLinejoin="round"
            />

            {/* Synchronized Hover Crosshair */}
            {crosshairX !== null && activeSample && (
              <g>
                <line
                  x1={crosshairX}
                  y1={PAD.top}
                  x2={crosshairX}
                  y2={PAD.top + PLOT_H}
                  stroke="#E2E8F0"
                  strokeOpacity="0.45"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                <circle
                  cx={crosshairX}
                  cy={yForPressure(activeSample.tankPressureBar)}
                  r="3.5"
                  fill="#60A5FA"
                  stroke="#0B0F19"
                  strokeWidth="1.5"
                />
                <circle
                  cx={crosshairX}
                  cy={yForPressure(activeFilteredPc)}
                  r="4"
                  fill="#06B6D4"
                  stroke="#0B0F19"
                  strokeWidth="1.5"
                />
                {showRawSignal && (
                  <circle
                    cx={crosshairX}
                    cy={yForPressure(activeSample.chamberPressureRawBar)}
                    r="3"
                    fill="#F59E0B"
                    stroke="#0B0F19"
                    strokeWidth="1"
                  />
                )}
              </g>
            )}
          </svg>
        </div>
      </section>

      {/* CHART 2: Nozzle Throat Temperature & Propellant Mass Flow Rate */}
      <section className="bg-[#111827] border border-[#1F2937] rounded-md p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Nozzle Throat Temperature &amp; Propellant Mass Flow Rate
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-slate-400 mt-1">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-[#F59E0B] inline-block" />
                Nozzle Temp (°C, Left)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 border-t border-dashed border-[#EF4444]/80 inline-block" />
                Thermal Limit ({profile.safeTempLimitC} °C)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-[#06B6D4] inline-block" />
                Measured Mass Flow (g/s, Right)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 border-t border-dashed border-slate-400 inline-block" />
                Expected Flow
              </span>
            </div>
          </div>

          {activeSample && (
            <div className="flex items-center gap-3 bg-[#0B0F19] border border-[#1F2937] rounded px-2.5 py-1 text-[11px] font-mono tabular-nums">
              <span className="text-[#F59E0B]">
                T<sub>n</sub> {activeSample.nozzleTempC.toFixed(1)} °C
              </span>
              <span className="text-[#06B6D4]">
                ṁ {activeSample.massFlowMeasuredGs.toFixed(2)} g/s
              </span>
              <span className="text-slate-400">
                Exp {activeSample.massFlowExpectedGs.toFixed(2)} g/s
              </span>
            </div>
          )}
        </div>

        <div className="w-full bg-[#0B0F19] border border-[#1F2937] rounded overflow-hidden">
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            className="w-full h-auto block cursor-crosshair select-none"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            role="img"
            aria-label="Synchronized Nozzle Temperature and Mass Flow Rate dual-axis time-series chart"
          >
            {/* Thermal Over-Limit Zone */}
            <rect
              x={PAD.left}
              y={PAD.top}
              width={PLOT_W}
              height={Math.max(0, safeTempY - PAD.top)}
              fill="#EF4444"
              fillOpacity="0.06"
            />

            {/* Left Y-Axis Gridlines & Temp Labels */}
            {tempTicks.map((t) => {
              const y = yForTemp(t);
              return (
                <g key={`temp-${t}`}>
                  <line
                    x1={PAD.left}
                    y1={y}
                    x2={PAD.left + PLOT_W}
                    y2={y}
                    stroke="#1F2937"
                    strokeWidth="1"
                  />
                  <text
                    x={PAD.left - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    fill="#F59E0B"
                    fillOpacity="0.85"
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {t}
                  </text>
                </g>
              );
            })}

            {/* Right Y-Axis Mass Flow Labels */}
            {flowTicks.map((f) => {
              const y = yForFlow(f);
              return (
                <text
                  key={`flow-${f}`}
                  x={PAD.left + PLOT_W + 8}
                  y={y + 3.5}
                  textAnchor="start"
                  fill="#06B6D4"
                  fillOpacity="0.85"
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {f.toFixed(profile.id === 'geo-440n' ? 0 : 1)}
                </text>
              );
            })}

            {/* Axis Titles */}
            <text
              x={14}
              y={PAD.top + PLOT_H / 2}
              textAnchor="middle"
              fill="#F59E0B"
              fillOpacity="0.75"
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
              transform={`rotate(-90 14 ${PAD.top + PLOT_H / 2})`}
            >
              NOZZLE TEMP (°C)
            </text>
            <text
              x={CHART_W - 12}
              y={PAD.top + PLOT_H / 2}
              textAnchor="middle"
              fill="#06B6D4"
              fillOpacity="0.75"
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
              transform={`rotate(90 ${CHART_W - 12} ${PAD.top + PLOT_H / 2})`}
            >
              MASS FLOW (g/s)
            </text>

            {/* Thermal Limit Line */}
            <line
              x1={PAD.left}
              y1={safeTempY}
              x2={PAD.left + PLOT_W}
              y2={safeTempY}
              stroke="#EF4444"
              strokeOpacity="0.7"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <text
              x={PAD.left + 6}
              y={safeTempY - 4}
              textAnchor="start"
              fill="#EF4444"
              fillOpacity="0.9"
              fontSize="9"
              fontFamily="JetBrains Mono, monospace"
            >
              THERMAL LIMIT ({profile.safeTempLimitC} °C)
            </text>

            {/* X-Axis Ticks */}
            {xTicks.map((tick, idx) => (
              <g key={idx}>
                <line
                  x1={tick.x}
                  y1={PAD.top}
                  x2={tick.x}
                  y2={PAD.top + PLOT_H}
                  stroke="#1F2937"
                  strokeOpacity="0.55"
                  strokeWidth="1"
                />
                <text
                  x={tick.x}
                  y={CHART_H - 8}
                  textAnchor="middle"
                  fill="#64748B"
                  fontSize="9.5"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {tick.label}
                </text>
              </g>
            ))}

            {/* Expected Mass Flow Trace (dashed) */}
            <path
              d={thermalFlowPaths.flowExp}
              fill="none"
              stroke="#94A3B8"
              strokeOpacity="0.65"
              strokeWidth="1.25"
              strokeDasharray="3 3"
              strokeLinejoin="round"
            />
            {/* Measured Mass Flow Trace */}
            <path
              d={thermalFlowPaths.flowMeas}
              fill="none"
              stroke="#06B6D4"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            {/* Nozzle Temperature Trace */}
            <path
              d={thermalFlowPaths.temp}
              fill="none"
              stroke="#F59E0B"
              strokeWidth="2.1"
              strokeLinejoin="round"
            />

            {/* Synchronized Hover Crosshair */}
            {crosshairX !== null && activeSample && (
              <g>
                <line
                  x1={crosshairX}
                  y1={PAD.top}
                  x2={crosshairX}
                  y2={PAD.top + PLOT_H}
                  stroke="#E2E8F0"
                  strokeOpacity="0.45"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                <circle
                  cx={crosshairX}
                  cy={yForTemp(activeSample.nozzleTempC)}
                  r="4"
                  fill="#F59E0B"
                  stroke="#0B0F19"
                  strokeWidth="1.5"
                />
                <circle
                  cx={crosshairX}
                  cy={yForFlow(activeSample.massFlowMeasuredGs)}
                  r="4"
                  fill="#06B6D4"
                  stroke="#0B0F19"
                  strokeWidth="1.5"
                />
              </g>
            )}
          </svg>
        </div>
      </section>
    </div>
  );
};
