import React from 'react';
import {
  FilterMethod,
  MissionProfileConfig,
  TelemetrySample,
} from '../types/telemetry';

interface KpiCardsProps {
  sample: TelemetrySample;
  profile: MissionProfileConfig;
  filterMethod: FilterMethod;
}

export const KpiCards: React.FC<KpiCardsProps> = ({
  sample,
  profile,
  filterMethod,
}) => {
  const filteredPc =
    filterMethod === 'kalman'
      ? sample.chamberPressureKalmanBar
      : sample.chamberPressureEmaBar;

  const tankLow = sample.tankPressureBar < 12.5;
  const pcAnomaly =
    Math.abs(sample.pressureResidualBar) > 0.85 ||
    (sample.chamberPressureModelBar > 1 &&
      (filteredPc > profile.safePcMaxBar || filteredPc < profile.safePcMinBar));
  const tempCritical = sample.nozzleTempC >= profile.safeTempLimitC;
  const tempWarning =
    !tempCritical && sample.nozzleTempC >= profile.safeTempLimitC - 55;
  const propLow = sample.remainingPropellantPct < 20;

  const thermalMargin = profile.safeTempLimitC - sample.nozzleTempC;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
      {/* 1. Tank Pressure */}
      <div className="bg-[#111827] border border-[#1F2937] rounded-md p-4 flex flex-col justify-between">
        <div className="text-xs font-medium text-slate-400">Tank Pressure</div>
        <div className="mt-2 flex items-baseline">
          <span
            className={`text-2xl font-mono font-semibold tabular-nums tracking-tight ${
              tankLow ? 'text-[#F59E0B]' : 'text-slate-100'
            }`}
          >
            {sample.tankPressureBar.toFixed(2)}
          </span>
          <span className="text-xs font-mono text-slate-400 ml-1.5">bar</span>
        </div>
        <div className="mt-2 text-[11px] font-mono tabular-nums text-slate-400">
          {tankLow ? (
            <span className="text-[#F59E0B]">▲ Low ullage pressure</span>
          ) : (
            <span>Nominal range 14–22 bar</span>
          )}
        </div>
      </div>

      {/* 2. Chamber Pressure */}
      <div className="bg-[#111827] border border-[#1F2937] rounded-md p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-medium text-slate-400">
            Chamber Pressure (P<sub>c</sub>)
          </span>
          <span className="text-[10px] font-mono text-slate-500 uppercase">
            {filterMethod}
          </span>
        </div>
        <div className="mt-2 flex items-baseline">
          <span
            className={`text-2xl font-mono font-semibold tabular-nums tracking-tight ${
              pcAnomaly ? 'text-[#EF4444]' : 'text-[#06B6D4]'
            }`}
          >
            {filteredPc.toFixed(2)}
          </span>
          <span className="text-xs font-mono text-slate-400 ml-1.5">bar</span>
        </div>
        <div className="mt-2 text-[11px] font-mono tabular-nums text-slate-400">
          Residual{' '}
          <span
            className={
              Math.abs(sample.pressureResidualBar) > 0.85
                ? 'text-[#EF4444] font-semibold'
                : 'text-slate-300'
            }
          >
            {sample.pressureResidualBar >= 0 ? '+' : ''}
            {sample.pressureResidualBar.toFixed(2)} bar
          </span>
        </div>
      </div>

      {/* 3. Nozzle Throat Temperature */}
      <div className="bg-[#111827] border border-[#1F2937] rounded-md p-4 flex flex-col justify-between">
        <div className="text-xs font-medium text-slate-400">
          Nozzle Temp (T<sub>n</sub>)
        </div>
        <div className="mt-2 flex items-baseline">
          <span
            className={`text-2xl font-mono font-semibold tabular-nums tracking-tight ${
              tempCritical
                ? 'text-[#EF4444]'
                : tempWarning
                ? 'text-[#F59E0B]'
                : 'text-slate-100'
            }`}
          >
            {sample.nozzleTempC.toFixed(1)}
          </span>
          <span className="text-xs font-mono text-slate-400 ml-1.5">°C</span>
        </div>
        <div className="mt-2 text-[11px] font-mono tabular-nums text-slate-400">
          {thermalMargin < 0 ? (
            <span className="text-[#EF4444] font-semibold">
              ✖ +{Math.abs(thermalMargin).toFixed(0)} °C over limit
            </span>
          ) : (
            <span>Margin +{thermalMargin.toFixed(0)} °C</span>
          )}
        </div>
      </div>

      {/* 4. Specific Impulse Isp */}
      <div className="bg-[#111827] border border-[#1F2937] rounded-md p-4 flex flex-col justify-between">
        <div className="text-xs font-medium text-slate-400">
          Specific Impulse (I<sub>sp</sub>)
        </div>
        <div className="mt-2 flex items-baseline">
          <span className="text-2xl font-mono font-semibold tabular-nums tracking-tight text-slate-100">
            {sample.ispSec.toFixed(1)}
          </span>
          <span className="text-xs font-mono text-slate-400 ml-1.5">s</span>
        </div>
        <div className="mt-2 text-[11px] font-mono tabular-nums text-slate-400">
          Thrust{' '}
          <span className="text-slate-200">{sample.thrustN.toFixed(1)} N</span>
        </div>
      </div>

      {/* 5. Remaining Propellant */}
      <div className="bg-[#111827] border border-[#1F2937] rounded-md p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-medium text-slate-400">
            Remaining Propellant
          </span>
          <span className="text-[11px] font-mono tabular-nums text-slate-400">
            {sample.massFlowMeasuredGs.toFixed(1)} g/s
          </span>
        </div>
        <div className="mt-2 flex items-baseline">
          <span
            className={`text-2xl font-mono font-semibold tabular-nums tracking-tight ${
              propLow ? 'text-[#F59E0B]' : 'text-slate-100'
            }`}
          >
            {sample.remainingPropellantPct.toFixed(2)}
          </span>
          <span className="text-xs font-mono text-slate-400 ml-1.5">%</span>
        </div>
        <div className="mt-2 w-full h-1.5 bg-[#0B0F19] rounded-xs overflow-hidden border border-[#1F2937]">
          <div
            className={`h-full transition-all duration-150 ${
              propLow ? 'bg-[#F59E0B]' : 'bg-[#06B6D4]'
            }`}
            style={{ width: `${Math.max(0, Math.min(100, sample.remainingPropellantPct))}%` }}
          />
        </div>
      </div>
    </div>
  );
};
