import React from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import {
  ControlParams,
  FaultMode,
  FilterMethod,
  MissionProfileConfig,
  TelemetrySample,
} from '../types/telemetry';

interface ControlSidebarProps {
  profile: MissionProfileConfig;
  controls: ControlParams;
  onControlsChange: (next: Partial<ControlParams>) => void;
  faultMode: FaultMode;
  onFaultModeChange: (mode: FaultMode) => void;
  showRawSignal: boolean;
  onToggleRawSignal: (show: boolean) => void;
  filterMethod: FilterMethod;
  onFilterMethodChange: (method: FilterMethod) => void;
  isRunning: boolean;
  onToggleRunning: () => void;
  onResetSimulation: () => void;
  latestSample: TelemetrySample;
}

const FAULT_SCENARIOS: {
  id: FaultMode;
  label: string;
  effect: string;
  tone: 'nominal' | 'warning' | 'critical';
}[] = [
  {
    id: 'normal',
    label: 'Normal Operation',
    effect: 'Reset fault injection to nominal baseline',
    tone: 'nominal',
  },
  {
    id: 'micro-leak',
    label: 'Propellant Line Micro-Leak',
    effect: 'Gradual tank decay + mass flow mismatch',
    tone: 'warning',
  },
  {
    id: 'transducer-drift',
    label: 'Pressure Transducer Drift',
    effect: 'IDPT sensor bias offset + HF noise spike',
    tone: 'critical',
  },
  {
    id: 'valve-sticking',
    label: 'Thruster Valve Sticking',
    effect: 'Delayed chamber rise + nozzle thermal spike',
    tone: 'critical',
  },
];

export const ControlSidebar: React.FC<ControlSidebarProps> = ({
  profile,
  controls,
  onControlsChange,
  faultMode,
  onFaultModeChange,
  showRawSignal,
  onToggleRawSignal,
  filterMethod,
  onFilterMethodChange,
  isRunning,
  onToggleRunning,
  onResetSimulation,
  latestSample,
}) => {
  // Determine reactive highlights on the feedline schematic
  const leakActive = faultMode === 'micro-leak';
  const driftActive = faultMode === 'transducer-drift';
  const valveActive = faultMode === 'valve-sticking' || controls.valveLatencyMs >= 34;
  const firingActive = controls.dutyCyclePct > 1 && latestSample.remainingPropellantPct > 0.1;
  const thermalHot = latestSample.nozzleTempC > profile.safeTempLimitC - 45;

  return (
    <aside className="w-full lg:w-[336px] shrink-0 bg-[#111827] border border-[#1F2937] rounded-md flex flex-col divide-y divide-[#1F2937]">
      {/* Section 1: Propulsion Command Parameters */}
      <section className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">
            Propulsion Control Parameters
          </h2>
          <span className="text-[11px] font-mono text-slate-400">
            {profile.shortName}
          </span>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          {profile.propellantType} · Rated {profile.ratedThrustN} N · Nominal I
          <sub>sp</sub> {profile.nominalIspS} s
        </p>

        {/* Tank Pressure Slider */}
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label
              htmlFor="slider-tank-pressure"
              className="text-xs font-medium text-slate-300"
            >
              Propellant Tank Pressure
            </label>
            <span className="font-mono tabular-nums text-sm font-semibold text-[#06B6D4]">
              {controls.tankPressureSetBar.toFixed(1)}
              <span className="text-[11px] font-normal text-slate-400 ml-1">bar</span>
            </span>
          </div>
          <input
            id="slider-tank-pressure"
            type="range"
            min={10}
            max={25}
            step={0.1}
            value={controls.tankPressureSetBar}
            onChange={(e) =>
              onControlsChange({ tankPressureSetBar: parseFloat(e.target.value) })
            }
            className="telemetry-slider"
          />
          <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-500">
            <span>10.0 bar</span>
            <span>Nominal 18.5</span>
            <span>25.0 bar</span>
          </div>
        </div>

        {/* Duty Cycle Slider */}
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label
              htmlFor="slider-duty-cycle"
              className="text-xs font-medium text-slate-300"
            >
              Thruster Duty Cycle / Pulse Width
            </label>
            <span className="font-mono tabular-nums text-sm font-semibold text-[#06B6D4]">
              {controls.dutyCyclePct.toFixed(0)}
              <span className="text-[11px] font-normal text-slate-400 ml-1">%</span>
            </span>
          </div>
          <input
            id="slider-duty-cycle"
            type="range"
            min={0}
            max={100}
            step={1}
            value={controls.dutyCyclePct}
            onChange={(e) =>
              onControlsChange({ dutyCyclePct: parseInt(e.target.value, 10) })
            }
            className="telemetry-slider"
          />
          <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-500">
            <span>0% (Off)</span>
            <span>45% PWM</span>
            <span>100% (Cont.)</span>
          </div>
        </div>

        {/* Valve Latency Slider */}
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label
              htmlFor="slider-valve-latency"
              className="text-xs font-medium text-slate-300"
            >
              Injector Valve Opening Latency
            </label>
            <span
              className={`font-mono tabular-nums text-sm font-semibold ${
                controls.valveLatencyMs >= 34 ? 'text-[#F59E0B]' : 'text-[#06B6D4]'
              }`}
            >
              {controls.valveLatencyMs}
              <span className="text-[11px] font-normal text-slate-400 ml-1">ms</span>
            </span>
          </div>
          <input
            id="slider-valve-latency"
            type="range"
            min={5}
            max={50}
            step={1}
            value={controls.valveLatencyMs}
            onChange={(e) =>
              onControlsChange({ valveLatencyMs: parseInt(e.target.value, 10) })
            }
            className="telemetry-slider"
          />
          <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-500">
            <span>5 ms</span>
            <span>Nominal 12 ms</span>
            <span>50 ms</span>
          </div>
        </div>
      </section>

      {/* Section 2: Fault Injection Scenarios */}
      <section className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">
            Fault Injection Scenarios
          </h2>
          <span className="text-[11px] font-mono text-slate-400">One-Click</span>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {FAULT_SCENARIOS.map((scenario) => {
            const isActive = faultMode === scenario.id;
            let activeClass =
              'bg-[#0B0F19] border-[#1F2937] hover:border-slate-600 text-slate-200';
            if (isActive && scenario.id === 'normal') {
              activeClass =
                'bg-[#06B6D4]/12 border-[#06B6D4] text-slate-100';
            } else if (isActive && scenario.tone === 'warning') {
              activeClass =
                'bg-[#F59E0B]/12 border-[#F59E0B] text-slate-100';
            } else if (isActive && scenario.tone === 'critical') {
              activeClass =
                'bg-[#EF4444]/12 border-[#EF4444] text-slate-100';
            }

            const indicatorColor =
              scenario.id === 'normal'
                ? 'text-[#06B6D4]'
                : scenario.tone === 'warning'
                ? 'text-[#F59E0B]'
                : 'text-[#EF4444]';

            return (
              <button
                key={scenario.id}
                type="button"
                onClick={() => onFaultModeChange(scenario.id)}
                aria-pressed={isActive}
                className={`w-full text-left px-3 py-2.5 rounded border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#06B6D4] ${activeClass}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold leading-snug">
                    {scenario.label}
                  </span>
                  {isActive && (
                    <span
                      className={`text-[11px] font-mono font-semibold uppercase tracking-wide ${indicatorColor}`}
                    >
                      Active
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                  {scenario.effect}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Section 3: Signal Conditioning */}
      <section className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">
            Signal Conditioning
          </h2>
          <span className="text-[11px] font-mono text-slate-400">IDPT Filter</span>
        </div>

        <label className="flex items-center justify-between gap-3 cursor-pointer select-none py-1">
          <span className="text-xs text-slate-300">
            Show Raw vs. Filtered Transducer Signal
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={showRawSignal}
            onClick={() => onToggleRawSignal(!showRawSignal)}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#06B6D4] ${
              showRawSignal ? 'bg-[#06B6D4]' : 'bg-[#1F2937]'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-xs bg-[#0B0F19] transition-transform ${
                showRawSignal ? 'translate-x-4.5' : 'translate-x-1'
              }`}
            />
          </button>
        </label>

        <div className="grid grid-cols-2 gap-1 p-1 bg-[#0B0F19] border border-[#1F2937] rounded">
          <button
            type="button"
            onClick={() => onFilterMethodChange('kalman')}
            className={`py-1.5 px-2 text-xs font-medium rounded-xs transition-colors cursor-pointer whitespace-nowrap ${
              filterMethod === 'kalman'
                ? 'bg-[#1F2937] text-[#06B6D4]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Kalman Filter
          </button>
          <button
            type="button"
            onClick={() => onFilterMethodChange('ema')}
            className={`py-1.5 px-2 text-xs font-medium rounded-xs transition-colors cursor-pointer whitespace-nowrap ${
              filterMethod === 'ema'
                ? 'bg-[#1F2937] text-[#06B6D4]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            EMA Filter
          </button>
        </div>
      </section>

      {/* Section 4: Live Feedline Schematic */}
      <section className="p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">
            Feedline Architecture
          </h2>
          <span className="text-[11px] font-mono tabular-nums text-slate-400">
            Lag {latestSample.effectiveLatencyMs.toFixed(0)} ms
          </span>
        </div>

        <div className="bg-[#0B0F19] border border-[#1F2937] rounded p-3">
          <svg
            viewBox="0 0 296 96"
            className="w-full h-auto"
            role="img"
            aria-label="Live spacecraft propulsion feedline schematic showing propellant tank, flow sensor, injector valve, IDPT chamber sensor, and nozzle"
          >
            {/* Feed Pipe Tank -> Valve */}
            <line
              x1="62"
              y1="44"
              x2="132"
              y2="44"
              stroke={leakActive ? '#F59E0B' : '#06B6D4'}
              strokeWidth="2.5"
              strokeDasharray={leakActive ? '4 3' : undefined}
            />
            {/* Leak indicator callout */}
            {leakActive && (
              <g>
                <line x1="97" y1="44" x2="97" y2="22" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="2 2" />
                <text
                  x="97"
                  y="16"
                  textAnchor="middle"
                  fill="#F59E0B"
                  fontSize="8.5"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="600"
                >
                  MICRO-LEAK
                </text>
              </g>
            )}

            {/* Pipe Valve -> Chamber */}
            <line
              x1="158"
              y1="44"
              x2="184"
              y2="44"
              stroke={valveActive ? '#EF4444' : firingActive ? '#06B6D4' : '#475569'}
              strokeWidth="2.5"
            />

            {/* Propellant Tank */}
            <rect
              x="8"
              y="18"
              width="54"
              height="52"
              rx="10"
              fill="#111827"
              stroke={latestSample.tankPressureBar < 12.2 ? '#F59E0B' : '#374151'}
              strokeWidth="1.5"
            />
            {/* Fluid fill level inside tank */}
            <rect
              x="10"
              y={18 + 50 * (1 - Math.max(0.05, latestSample.remainingPropellantPct / 100))}
              width="50"
              height={Math.max(2, 50 * (latestSample.remainingPropellantPct / 100))}
              rx="8"
              fill="#06B6D4"
              fillOpacity="0.22"
            />
            <text
              x="35"
              y="42"
              textAnchor="middle"
              fill="#E2E8F0"
              fontSize="8.5"
              fontFamily="JetBrains Mono, monospace"
              fontWeight="600"
            >
              TANK
            </text>
            <text
              x="35"
              y="54"
              textAnchor="middle"
              fill="#06B6D4"
              fontSize="8.5"
              fontFamily="JetBrains Mono, monospace"
            >
              {latestSample.tankPressureBar.toFixed(1)}b
            </text>

            {/* Mass Flow Meter node */}
            <circle
              cx="97"
              cy="44"
              r="7"
              fill="#111827"
              stroke={leakActive ? '#F59E0B' : '#475569'}
              strokeWidth="1.5"
            />
            <text
              x="97"
              y="66"
              textAnchor="middle"
              fill={leakActive ? '#F59E0B' : '#94A3B8'}
              fontSize="8"
              fontFamily="JetBrains Mono, monospace"
            >
              FM {latestSample.massFlowMeasuredGs.toFixed(1)}
            </text>

            {/* Solenoid Injector Valve (bowtie symbol) */}
            <polygon
              points="132,34 145,44 132,54"
              fill="#111827"
              stroke={valveActive ? '#EF4444' : '#06B6D4'}
              strokeWidth="1.5"
            />
            <polygon
              points="158,34 145,44 158,54"
              fill="#111827"
              stroke={valveActive ? '#EF4444' : '#06B6D4'}
              strokeWidth="1.5"
            />
            <text
              x="145"
              y="66"
              textAnchor="middle"
              fill={valveActive ? '#EF4444' : '#94A3B8'}
              fontSize="8"
              fontFamily="JetBrains Mono, monospace"
            >
              {valveActive ? 'VALVE LAG' : 'INJ VLV'}
            </text>

            {/* Combustion Chamber */}
            <rect
              x="184"
              y="26"
              width="48"
              height="36"
              rx="4"
              fill="#111827"
              stroke={driftActive ? '#EF4444' : firingActive ? '#06B6D4' : '#374151'}
              strokeWidth="1.5"
            />
            <text
              x="208"
              y="42"
              textAnchor="middle"
              fill="#E2E8F0"
              fontSize="8"
              fontFamily="JetBrains Mono, monospace"
              fontWeight="600"
            >
              CHAMBER
            </text>
            <text
              x="208"
              y="53"
              textAnchor="middle"
              fill={driftActive ? '#EF4444' : '#06B6D4'}
              fontSize="8.5"
              fontFamily="JetBrains Mono, monospace"
            >
              {latestSample.chamberPressureKalmanBar.toFixed(1)}b
            </text>

            {/* IDPT Sensor Tap */}
            <line
              x1="208"
              y1="26"
              x2="208"
              y2="14"
              stroke={driftActive ? '#EF4444' : '#64748B'}
              strokeWidth="1.5"
            />
            <text
              x="208"
              y="10"
              textAnchor="middle"
              fill={driftActive ? '#EF4444' : '#94A3B8'}
              fontSize="8"
              fontFamily="JetBrains Mono, monospace"
              fontWeight={driftActive ? '700' : '500'}
            >
              {driftActive ? 'IDPT DRIFT' : 'IDPT'}
            </text>

            {/* Converging-Diverging Nozzle */}
            <path
              d="M 232 30 L 244 37 L 268 24 L 268 64 L 244 51 L 232 58 Z"
              fill={thermalHot ? '#EF4444' : '#111827'}
              fillOpacity={thermalHot ? 0.2 : 1}
              stroke={thermalHot ? '#EF4444' : firingActive ? '#F59E0B' : '#475569'}
              strokeWidth="1.5"
            />
            {/* Exhaust plume indicator when firing */}
            {firingActive && (
              <path
                d="M 271 33 L 292 44 L 271 55 Z"
                fill={thermalHot ? '#EF4444' : '#06B6D4'}
                fillOpacity="0.35"
              />
            )}
            <text
              x="253"
              y="78"
              textAnchor="middle"
              fill={thermalHot ? '#EF4444' : '#F59E0B'}
              fontSize="8"
              fontFamily="JetBrains Mono, monospace"
            >
              {Math.round(latestSample.nozzleTempC)}°C
            </text>

            {/* Bottom reference label */}
            <text
              x="8"
              y="91"
              fill="#64748B"
              fontSize="7.5"
              fontFamily="JetBrains Mono, monospace"
            >
              THRUST {latestSample.thrustN.toFixed(1)} N · DUTY {controls.dutyCyclePct}%
            </text>
          </svg>
        </div>
      </section>

      {/* Section 5: Stream Playback Controls */}
      <section className="p-4 flex items-center gap-2 mt-auto">
        <button
          type="button"
          onClick={onToggleRunning}
          className="flex-1 inline-flex items-center justify-center gap-2 py-2 px-3 rounded bg-[#0B0F19] hover:bg-slate-800 border border-[#1F2937] text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
        >
          {isRunning ? (
            <>
              <Pause className="w-3.5 h-3.5 text-[#F59E0B]" aria-hidden="true" />
              <span>Pause Stream</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 text-[#06B6D4]" aria-hidden="true" />
              <span>Resume Stream</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onResetSimulation}
          className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded bg-[#0B0F19] hover:bg-slate-800 border border-[#1F2937] text-xs font-medium text-slate-300 hover:text-slate-100 transition-colors cursor-pointer whitespace-nowrap"
          title="Reset telemetry buffer and refill propellant tank"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Reset</span>
        </button>
      </section>
    </aside>
  );
};
