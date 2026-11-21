import { useCallback, useEffect, useRef, useState } from 'react';
import { ControlSidebar } from './components/ControlSidebar';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { Header } from './components/Header';
import { KpiCards } from './components/KpiCards';
import { TelemetryCharts } from './components/TelemetryCharts';
import {
  createInitialEngineState,
  DT_SEC,
  formatUtcTime,
  generateTelemetryCsv,
  MISSION_PROFILES,
  stepPropulsionSimulation,
  TELEMETRY_WINDOW_SIZE,
} from './engine/propulsionPhysics';
import {
  ControlParams,
  DiagnosticLogEntry,
  FaultMode,
  FilterMethod,
  MissionProfileId,
  SimulationEngineState,
  TelemetrySample,
} from './types/telemetry';

const DEFAULT_CONTROLS: ControlParams = {
  tankPressureSetBar: 18.5,
  dutyCyclePct: 45,
  valveLatencyMs: 12,
};

const MAX_EXPORT_HISTORY = 3600; // Up to 6 minutes of 10 Hz data for CSV export

function buildBootstrappedSession(
  missionId: MissionProfileId,
  controls: ControlParams
): {
  engineState: SimulationEngineState;
  windowSamples: TelemetrySample[];
  exportSamples: TelemetrySample[];
  initialLogs: DiagnosticLogEntry[];
} {
  let state = createInitialEngineState(missionId, controls);
  const samples: TelemetrySample[] = [];
  const now = Date.now();
  const seedSteps = 60; // 6 seconds of settled nominal history on initial render

  for (let i = seedSteps; i >= 1; i--) {
    const sampleTime = now - i * DT_SEC * 1000;
    const res = stepPropulsionSimulation(state, missionId, controls, 'normal', sampleTime);
    state = res.nextState;
    samples.push(res.sample);
  }

  const profile = MISSION_PROFILES[missionId];
  const initLog: DiagnosticLogEntry = {
    id: `boot-${missionId}-${now}`,
    timestamp: formatUtcTime(now),
    elapsedSec: state.elapsedSec,
    severity: 'INFO',
    subsystem: 'Telemetry Acquisition',
    title: `Mission Profile Armed: ${profile.name}`,
    rootCause: `10 Hz coupled physics loop and 1D Kalman transducer filter calibrated (${profile.propellantType}, nominal tank ${controls.tankPressureSetBar.toFixed(1)} bar).`,
    correctiveAction: 'Monitoring nominal AOCS baseline. Ready for parameter sweeps or fault injection.',
    faultCode: 'INF-INIT-001',
  };

  return {
    engineState: state,
    windowSamples: samples.slice(-TELEMETRY_WINDOW_SIZE),
    exportSamples: samples,
    initialLogs: [initLog],
  };
}

export default function App() {
  const [missionId, setMissionId] = useState<MissionProfileId>('leo-22n');
  const [controls, setControls] = useState<ControlParams>(DEFAULT_CONTROLS);
  const [faultMode, setFaultMode] = useState<FaultMode>('normal');
  const [showRawSignal, setShowRawSignal] = useState<boolean>(true);
  const [filterMethod, setFilterMethod] = useState<FilterMethod>('kalman');
  const [isRunning, setIsRunning] = useState<boolean>(true);

  const bootRef = useRef<ReturnType<typeof buildBootstrappedSession> | null>(null);
  if (!bootRef.current) {
    bootRef.current = buildBootstrappedSession('leo-22n', DEFAULT_CONTROLS);
  }

  const engineStateRef = useRef<SimulationEngineState>(bootRef.current.engineState);
  const exportBufferRef = useRef<TelemetrySample[]>(bootRef.current.exportSamples);

  const [samples, setSamples] = useState<TelemetrySample[]>(bootRef.current.windowSamples);
  const [logs, setLogs] = useState<DiagnosticLogEntry[]>(bootRef.current.initialLogs);

  // Keep refs synced for 10 Hz interval callback without recreating timer
  const missionIdRef = useRef(missionId);
  const controlsRef = useRef(controls);
  const faultModeRef = useRef(faultMode);
  missionIdRef.current = missionId;
  controlsRef.current = controls;
  faultModeRef.current = faultMode;

  // 10 Hz Continuous Physics & Telemetry Stream
  useEffect(() => {
    if (!isRunning) return;

    const intervalId = window.setInterval(() => {
      const res = stepPropulsionSimulation(
        engineStateRef.current,
        missionIdRef.current,
        controlsRef.current,
        faultModeRef.current,
        Date.now()
      );

      engineStateRef.current = res.nextState;

      // Append to full export buffer (bounded to last 3600 samples)
      exportBufferRef.current.push(res.sample);
      if (exportBufferRef.current.length > MAX_EXPORT_HISTORY) {
        exportBufferRef.current.shift();
      }

      setSamples((prev) => {
        const next = [...prev, res.sample];
        return next.length > TELEMETRY_WINDOW_SIZE
          ? next.slice(next.length - TELEMETRY_WINDOW_SIZE)
          : next;
      });

      if (res.newLog) {
        setLogs((prev) => [res.newLog!, ...prev].slice(0, 60));
      }
    }, DT_SEC * 1000);

    return () => window.clearInterval(intervalId);
  }, [isRunning]);

  const handleControlsChange = useCallback((partial: Partial<ControlParams>) => {
    setControls((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleMissionChange = useCallback((nextMissionId: MissionProfileId) => {
    const nextProfile = MISSION_PROFILES[nextMissionId];
    const nextControls: ControlParams = {
      tankPressureSetBar: nextProfile.nominalTankPressureBar,
      dutyCyclePct: nextProfile.nominalDutyCyclePct,
      valveLatencyMs: nextProfile.nominalLatencyMs,
    };

    const boot = buildBootstrappedSession(nextMissionId, nextControls);
    engineStateRef.current = boot.engineState;
    exportBufferRef.current = boot.exportSamples;

    setMissionId(nextMissionId);
    setControls(nextControls);
    setFaultMode('normal');
    setSamples(boot.windowSamples);
    setLogs(boot.initialLogs);
  }, []);

  const handleFaultModeChange = useCallback((mode: FaultMode) => {
    setFaultMode(mode);
    // Reset fault elapsed ramp timer when switching between active fault modes
    engineStateRef.current = {
      ...engineStateRef.current,
      faultElapsedSec: 0,
    };
    if (mode === 'normal') {
      // Restore nominal baseline control defaults when resetting to normal operation
      const prof = MISSION_PROFILES[missionIdRef.current];
      setControls({
        tankPressureSetBar: prof.nominalTankPressureBar,
        dutyCyclePct: prof.nominalDutyCyclePct,
        valveLatencyMs: prof.nominalLatencyMs,
      });
    }
  }, []);

  const handleResetSimulation = useCallback(() => {
    const prof = MISSION_PROFILES[missionIdRef.current];
    const baseline: ControlParams = {
      tankPressureSetBar: prof.nominalTankPressureBar,
      dutyCyclePct: prof.nominalDutyCyclePct,
      valveLatencyMs: prof.nominalLatencyMs,
    };
    const boot = buildBootstrappedSession(missionIdRef.current, baseline);
    engineStateRef.current = boot.engineState;
    exportBufferRef.current = boot.exportSamples;
    setControls(baseline);
    setFaultMode('normal');
    setSamples(boot.windowSamples);
    setLogs(boot.initialLogs);
  }, []);

  const handleDownloadCsv = useCallback(() => {
    const profile = MISSION_PROFILES[missionIdRef.current];
    const csv = generateTelemetryCsv(exportBufferRef.current, profile);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.href = url;
    link.download = `propulsense-${profile.id}-telemetry-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  const profile = MISSION_PROFILES[missionId];
  const latestSample = samples[samples.length - 1];

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 flex flex-col">
      <Header
        missionId={missionId}
        onMissionChange={handleMissionChange}
        status={latestSample.status}
        elapsedSec={latestSample.elapsedSec}
        isRunning={isRunning}
        sampleCount={exportBufferRef.current.length}
        onDownloadCsv={handleDownloadCsv}
      />

      <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 lg:px-6 py-4 flex flex-col lg:flex-row items-start gap-4">
        {/* Left Sidebar: Interactive Propulsion & Fault Injection Control Panel */}
        <ControlSidebar
          profile={profile}
          controls={controls}
          onControlsChange={handleControlsChange}
          faultMode={faultMode}
          onFaultModeChange={handleFaultModeChange}
          showRawSignal={showRawSignal}
          onToggleRawSignal={setShowRawSignal}
          filterMethod={filterMethod}
          onFilterMethodChange={setFilterMethod}
          isRunning={isRunning}
          onToggleRunning={() => setIsRunning((r) => !r)}
          onResetSimulation={handleResetSimulation}
          latestSample={latestSample}
        />

        {/* Main Workspace: KPI Cards, Live Synchronized Charts & AI Diagnostics */}
        <div className="flex-1 min-w-0 w-full space-y-4">
          <KpiCards
            sample={latestSample}
            profile={profile}
            filterMethod={filterMethod}
          />

          <TelemetryCharts
            samples={samples}
            profile={profile}
            showRawSignal={showRawSignal}
            onToggleRawSignal={setShowRawSignal}
            filterMethod={filterMethod}
          />

          <DiagnosticsPanel
            latestSample={latestSample}
            logs={logs}
            onClearLogs={() => setLogs([])}
          />
        </div>
      </main>
    </div>
  );
}
