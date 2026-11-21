export type MissionProfileId = 'leo-22n' | 'geo-440n';

export type FaultMode = 'normal' | 'micro-leak' | 'transducer-drift' | 'valve-sticking';

export type SystemStatus = 'NOMINAL' | 'WARNING' | 'CRITICAL FAULT';

export type FaultSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type FilterMethod = 'kalman' | 'ema';

export interface MissionProfileConfig {
  id: MissionProfileId;
  name: string;
  shortName: string;
  propellantType: string;
  ratedThrustN: number;
  nominalIspS: number;
  nominalTankPressureBar: number;
  nominalDutyCyclePct: number;
  nominalLatencyMs: number;
  pcTankRatio: number; // Nominal chamber pressure ratio relative to tank pressure at 100% duty
  maxMassFlowGs: number; // g/s at reference 18.5 bar & 100% duty
  ambientTempC: number;
  maxSteadyTempC: number;
  safeTempLimitC: number;
  safePcMinBar: number;
  safePcMaxBar: number;
  initialPropellantKg: number;
  depletionTimeScale: number; // Visual test acceleration multiplier for visible mass depletion
  nominalNoiseSigmaBar: number;
}

export interface ControlParams {
  tankPressureSetBar: number; // 10 - 25 bar
  dutyCyclePct: number; // 0 - 100 %
  valveLatencyMs: number; // 5 - 50 ms
}

export interface TelemetrySample {
  seq: number;
  timestampMs: number;
  elapsedSec: number;
  missionId: MissionProfileId;
  faultMode: FaultMode;
  // Pressures (bar)
  tankPressureBar: number;
  chamberPressureModelBar: number;
  chamberPressureTrueBar: number;
  chamberPressureRawBar: number;
  chamberPressureKalmanBar: number;
  chamberPressureEmaBar: number;
  // Thermal & Flow
  nozzleTempC: number;
  expectedTempC: number;
  massFlowMeasuredGs: number;
  massFlowExpectedGs: number;
  remainingPropellantPct: number;
  // Performance
  ispSec: number;
  thrustN: number;
  effectiveLatencyMs: number;
  // Diagnostics
  pressureResidualBar: number;
  massFlowResidualGs: number;
  pressureZScore: number;
  healthScore: number; // 0 - 100
  status: SystemStatus;
}

export interface DiagnosticLogEntry {
  id: string;
  timestamp: string;
  elapsedSec: number;
  severity: FaultSeverity;
  subsystem: string;
  title: string;
  rootCause: string;
  correctiveAction: string;
  faultCode: string;
}

export interface SimulationEngineState {
  seq: number;
  elapsedSec: number;
  faultElapsedSec: number;
  currentTankPressureBar: number;
  tankPressureDecayAccumBar: number;
  currentChamberPressureTrueBar: number;
  currentNozzleTempC: number;
  remainingPropellantKg: number;
  // Kalman filter internal state
  kalmanEstimate: number;
  kalmanCovariance: number;
  // EMA filter internal state
  emaEstimate: number;
  // Rolling residual & noise window for Z-score calculation
  residualWindow: number[];
  tankPressureHistory: number[];
  // Cooldown tracking for automated diagnostic logging
  lastLoggedKey: string | null;
  lastLoggedElapsedSec: number;
}
