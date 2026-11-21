import {
  ControlParams,
  DiagnosticLogEntry,
  FaultMode,
  MissionProfileConfig,
  MissionProfileId,
  SimulationEngineState,
  SystemStatus,
  TelemetrySample,
} from '../types/telemetry';

export const MISSION_PROFILES: Record<MissionProfileId, MissionProfileConfig> = {
  'leo-22n': {
    id: 'leo-22n',
    name: 'LEO Satellite AOCS 22N Thruster',
    shortName: 'LEO 22N AOCS',
    propellantType: 'Monopropellant N₂H₄ (Hydrazine)',
    ratedThrustN: 22,
    nominalIspS: 232,
    nominalTankPressureBar: 18.5,
    nominalDutyCyclePct: 45,
    nominalLatencyMs: 12,
    pcTankRatio: 0.58,
    maxMassFlowGs: 9.65,
    ambientTempC: 42,
    maxSteadyTempC: 760,
    safeTempLimitC: 780,
    safePcMinBar: 2.8,
    safePcMaxBar: 11.4,
    initialPropellantKg: 42.0,
    depletionTimeScale: 18,
    nominalNoiseSigmaBar: 0.14,
  },
  'geo-440n': {
    id: 'geo-440n',
    name: 'GEO Transfer 440N LAM Engine',
    shortName: 'GEO 440N LAM',
    propellantType: 'Bipropellant MMH / NTO',
    ratedThrustN: 440,
    nominalIspS: 318,
    nominalTankPressureBar: 18.5,
    nominalDutyCyclePct: 45,
    nominalLatencyMs: 12,
    pcTankRatio: 0.69,
    maxMassFlowGs: 141.2,
    ambientTempC: 55,
    maxSteadyTempC: 1180,
    safeTempLimitC: 1220,
    safePcMinBar: 4.2,
    safePcMaxBar: 14.0,
    initialPropellantKg: 580.0,
    depletionTimeScale: 16,
    nominalNoiseSigmaBar: 0.21,
  },
};

export const DT_SEC = 0.1; // 10 Hz simulation step
export const TELEMETRY_WINDOW_SIZE = 150; // 15 seconds of 10 Hz live samples

/**
 * Box-Muller transform for standard normal Gaussian noise N(0, 1)
 */
function gaussianRandom(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

export function formatUtcTime(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  const tenths = Math.floor(d.getUTCMilliseconds() / 100);
  return `${hh}:${mm}:${ss}.${tenths}Z`;
}

/**
 * Compute steady-state expected chamber pressure given tank pressure, duty cycle, and latency
 */
function computeTargetChamberPressure(
  profile: MissionProfileConfig,
  tankPressureBar: number,
  dutyCyclePct: number,
  latencyMs: number
): number {
  if (dutyCyclePct <= 0.5) return 0.0;
  // Duty cycle maps pulse-width modulation to effective chamber pressure level
  const dutyNorm = clamp(dutyCyclePct / 100, 0, 1);
  const dutyScale = 0.32 + 0.68 * dutyNorm;
  // Valve latency trims effective pressure slightly at high pulse frequency
  const latencyEfficiency = clamp(1 - Math.max(0, latencyMs - 10) * 0.0022, 0.85, 1.0);
  return Math.max(0, tankPressureBar * profile.pcTankRatio * dutyScale * latencyEfficiency);
}

/**
 * Compute steady-state equilibrium nozzle throat temperature
 */
function computeEquilibriumTemp(
  profile: MissionProfileConfig,
  dutyCyclePct: number,
  chamberPressureBar: number
): number {
  const dutyNorm = clamp(dutyCyclePct / 100, 0, 1);
  const pcNorm = clamp(chamberPressureBar / (profile.nominalTankPressureBar * profile.pcTankRatio), 0, 1.4);
  const thermalLoad = Math.pow(dutyNorm, 0.72) * (0.45 + 0.55 * pcNorm);
  return profile.ambientTempC + (profile.maxSteadyTempC - profile.ambientTempC) * thermalLoad;
}

export function createInitialEngineState(
  profileId: MissionProfileId,
  controls: ControlParams
): SimulationEngineState {
  const profile = MISSION_PROFILES[profileId];
  const initialPc = computeTargetChamberPressure(
    profile,
    controls.tankPressureSetBar,
    controls.dutyCyclePct,
    controls.valveLatencyMs
  );
  const initialTemp = computeEquilibriumTemp(profile, controls.dutyCyclePct, initialPc);

  return {
    seq: 0,
    elapsedSec: 0,
    faultElapsedSec: 0,
    currentTankPressureBar: controls.tankPressureSetBar,
    tankPressureDecayAccumBar: 0,
    currentChamberPressureTrueBar: initialPc,
    currentNozzleTempC: initialTemp,
    remainingPropellantKg: profile.initialPropellantKg,
    kalmanEstimate: initialPc,
    kalmanCovariance: 0.25,
    emaEstimate: initialPc,
    residualWindow: Array(25).fill(0),
    tankPressureHistory: Array(20).fill(controls.tankPressureSetBar),
    lastLoggedKey: null,
    lastLoggedElapsedSec: -999,
  };
}

export interface StepResult {
  sample: TelemetrySample;
  nextState: SimulationEngineState;
  newLog: DiagnosticLogEntry | null;
}

/**
 * Advance the coupled spacecraft propulsion physics, Kalman filter, and AI diagnostics by 100ms (10 Hz).
 */
export function stepPropulsionSimulation(
  state: SimulationEngineState,
  profileId: MissionProfileId,
  controls: ControlParams,
  faultMode: FaultMode,
  nowMs: number = Date.now()
): StepResult {
  const profile = MISSION_PROFILES[profileId];
  const seq = state.seq + 1;
  const elapsedSec = Number((state.elapsedSec + DT_SEC).toFixed(2));
  const faultElapsedSec =
    faultMode === 'normal' ? 0 : Number((state.faultElapsedSec + DT_SEC).toFixed(2));

  // 1. Propellant Tank Pressure Dynamics
  // Slight blowdown from propellant consumption + active decay under micro-leak
  const remainingFrac = clamp(state.remainingPropellantKg / profile.initialPropellantKg, 0, 1);
  const blowdownOffset = (1 - remainingFrac) * 2.2;

  let tankDecayAccum = state.tankPressureDecayAccumBar;
  if (faultMode === 'micro-leak') {
    // Progressive leak decay (-0.09 bar/s, capped so tank doesn't drop below 4.5 bar)
    tankDecayAccum = Math.min(tankDecayAccum + 0.092 * DT_SEC, Math.max(0, controls.tankPressureSetBar - 4.5));
  } else {
    // Smooth recovery when returning to normal operation
    tankDecayAccum = Math.max(0, tankDecayAccum - 1.6 * DT_SEC);
  }

  const targetTankPressure = Math.max(
    3.5,
    controls.tankPressureSetBar - blowdownOffset - tankDecayAccum
  );
  // First-order smoothing of tank pressure response to slider movements
  const tankPressureBar =
    state.currentTankPressureBar + (targetTankPressure - state.currentTankPressureBar) * 0.28 + gaussianRandom() * 0.018;

  // Estimate tank pressure decay rate (bar/s) over last 2 seconds (20 samples)
  const tankHistory = [...state.tankPressureHistory.slice(-19), tankPressureBar];
  const tankDecayRateBarPerSec =
    tankHistory.length >= 10
      ? (tankHistory[tankHistory.length - 1] - tankHistory[0]) / ((tankHistory.length - 1) * DT_SEC)
      : 0;

  // 2. Expected Physics-Model Chamber Pressure (nominal reference for residual comparison)
  const nominalLatencyRef = Math.min(controls.valveLatencyMs, 18);
  const expectedModelPcSteady = computeTargetChamberPressure(
    profile,
    tankPressureBar,
    controls.dutyCyclePct,
    nominalLatencyRef
  );

  // Subtle PWM pulse ripple during partial duty-cycle firing
  const pwmRipple =
    controls.dutyCyclePct > 2 && controls.dutyCyclePct < 98
      ? Math.sin(elapsedSec * Math.PI * 2.2) * (profile.id === 'leo-22n' ? 0.07 : 0.11)
      : 0;

  const chamberPressureModelBar = Math.max(0, expectedModelPcSteady + pwmRipple);

  // 3. Actual Physical Chamber Pressure (incorporating valve latency and sticking faults)
  const stickingRamp = faultMode === 'valve-sticking' ? clamp(faultElapsedSec / 1.8, 0, 1) : 0;
  const stickingAddedLagMs = faultMode === 'valve-sticking' ? 28 + 8 * Math.sin(faultElapsedSec * 1.9) : 0;
  const effectiveLatencyMs = controls.valveLatencyMs + stickingAddedLagMs * stickingRamp;

  // Valve lag slows rise/tracking time constant and introduces stick-slip pressure sag
  const lagTauSec = clamp((effectiveLatencyMs / 1000) * 9.5, 0.08, 0.95);
  const trackingAlpha = clamp(DT_SEC / (lagTauSec + DT_SEC), 0.08, 0.65);

  let targetTruePc = computeTargetChamberPressure(
    profile,
    tankPressureBar,
    controls.dutyCyclePct,
    effectiveLatencyMs
  );

  if (faultMode === 'valve-sticking' && controls.dutyCyclePct > 5) {
    // Periodic sticking droop & sluggish chamber pressure recovery
    const stickWave = 0.5 + 0.5 * Math.sin(faultElapsedSec * 2.1 - 0.8);
    const pressureSag = stickingRamp * (1.25 + 1.15 * stickWave) * (profile.id === 'geo-440n' ? 1.25 : 1.0);
    targetTruePc = Math.max(0.4, targetTruePc - pressureSag);
  }

  // If propellant completely exhausted, chamber pressure collapses
  if (state.remainingPropellantKg <= 0.01) {
    targetTruePc = 0;
  }

  const chamberPressureTrueBar = Math.max(
    0,
    state.currentChamberPressureTrueBar +
      (targetTruePc + pwmRipple - state.currentChamberPressureTrueBar) * trackingAlpha
  );

  // 4. Raw IDPT Pressure Transducer Signal (with Gaussian sensor noise + optional drift fault)
  const driftRamp = faultMode === 'transducer-drift' ? clamp(faultElapsedSec / 2.2, 0, 1) : 0;
  const driftBiasBar =
    faultMode === 'transducer-drift'
      ? driftRamp * (profile.id === 'geo-440n' ? 2.25 : 1.88) + 0.14 * Math.sin(faultElapsedSec * 1.4)
      : 0;
  const noiseMultiplier = faultMode === 'transducer-drift' ? 1 + 2.9 * driftRamp : 1.0;
  const sensorNoise = gaussianRandom() * profile.nominalNoiseSigmaBar * noiseMultiplier;
  const chamberPressureRawBar = Math.max(0, chamberPressureTrueBar + driftBiasBar + sensorNoise);

  // 5. Signal Conditioning: 1D Discrete Kalman Filter & Exponential Moving Average (EMA)
  // Process noise Q tuned to track real transients while rejecting high-frequency IDPT noise R
  const Q = 0.014;
  const R = Math.pow(profile.nominalNoiseSigmaBar * 1.55, 2);
  const predictedEst = state.kalmanEstimate;
  const predictedCov = state.kalmanCovariance + Q;
  const kalmanGain = predictedCov / (predictedCov + R);
  const chamberPressureKalmanBar = Math.max(
    0,
    predictedEst + kalmanGain * (chamberPressureRawBar - predictedEst)
  );
  const nextKalmanCov = (1 - kalmanGain) * predictedCov;

  // Exponential Moving Average (alpha = 0.24)
  const emaAlpha = 0.24;
  const chamberPressureEmaBar = Math.max(
    0,
    state.emaEstimate + emaAlpha * (chamberPressureRawBar - state.emaEstimate)
  );

  // 6. Nozzle Throat Temperature Thermal Model (°C)
  const expectedTempC = computeEquilibriumTemp(profile, controls.dutyCyclePct, chamberPressureModelBar);
  let targetTempC = computeEquilibriumTemp(profile, controls.dutyCyclePct, chamberPressureTrueBar);

  // Thermal spike during valve sticking (off-nominal dwell / injector hot-streaking)
  if (faultMode === 'valve-sticking' && controls.dutyCyclePct > 5) {
    const spikeMagnitude = profile.id === 'geo-440n' ? 235 : 185;
    targetTempC += stickingRamp * spikeMagnitude;
  } else if (controls.valveLatencyMs > 34 && controls.dutyCyclePct > 35) {
    // Manual extreme latency also causes modest thermal elevation
    targetTempC += ((controls.valveLatencyMs - 34) / 16) * 85;
  }

  // Asymmetric thermal inertia (heats faster than radiative cooling in vacuum)
  const tempRate = targetTempC >= state.currentNozzleTempC ? 0.16 : 0.075;
  const nozzleTempC =
    state.currentNozzleTempC +
    (targetTempC - state.currentNozzleTempC) * tempRate +
    gaussianRandom() * 1.15;

  // 7. Mass Flow Rate (g/s) & Propellant Mass Depletion Integration
  const refNominalPc = profile.nominalTankPressureBar * profile.pcTankRatio;
  const pcRatioToRef = clamp(chamberPressureTrueBar / Math.max(0.1, refNominalPc), 0, 1.8);
  const dutyNorm = clamp(controls.dutyCyclePct / 100, 0, 1);

  const massFlowExpectedGs = Math.max(
    0,
    profile.maxMassFlowGs * clamp(chamberPressureModelBar / Math.max(0.1, refNominalPc), 0, 1.8) * (0.25 + 0.75 * dutyNorm)
  );

  const actualChamberFlowGs = Math.max(
    0,
    profile.maxMassFlowGs * pcRatioToRef * (0.25 + 0.75 * dutyNorm)
  );

  const leakRamp = faultMode === 'micro-leak' ? clamp(faultElapsedSec / 1.5, 0, 1) : 0;
  const leakFlowGs =
    faultMode === 'micro-leak'
      ? leakRamp * (profile.id === 'geo-440n' ? 19.4 : 1.86) * (tankPressureBar / 18.5)
      : 0;

  const massFlowMeasuredGs = Math.max(
    0,
    actualChamberFlowGs + leakFlowGs + gaussianRandom() * (profile.id === 'geo-440n' ? 0.45 : 0.05)
  );

  // Deplete propellant mass (convert g/s to kg over dt, scaled for visible test-stand progression)
  const consumedKg = ((massFlowMeasuredGs / 1000) * DT_SEC) * profile.depletionTimeScale;
  const remainingPropellantKg = Math.max(0, state.remainingPropellantKg - consumedKg);
  const remainingPropellantPct = (remainingPropellantKg / profile.initialPropellantKg) * 100;

  // 8. Specific Impulse (Isp, s) & Thrust (N)
  const pressurePerfFactor = clamp(0.86 + 0.14 * (chamberPressureTrueBar / Math.max(1, refNominalPc * 0.65)), 0.72, 1.03);
  const stickingIspPenalty = faultMode === 'valve-sticking' ? stickingRamp * 19.5 : 0;
  const latencyIspPenalty = Math.max(0, controls.valveLatencyMs - 20) * 0.35;
  const ispSec =
    controls.dutyCyclePct <= 0.5 || remainingPropellantKg <= 0.01
      ? 0
      : Math.max(
          140,
          profile.nominalIspS * pressurePerfFactor - stickingIspPenalty - latencyIspPenalty + gaussianRandom() * 0.4
        );

  const thrustN = (actualChamberFlowGs / 1000) * ispSec * 9.80665;

  // 9. AI Anomaly Detection: Residual Error, Z-Score & Health Score (0-100%)
  const pressureResidualBar = chamberPressureKalmanBar - chamberPressureModelBar;
  const massFlowResidualGs = massFlowMeasuredGs - massFlowExpectedGs;
  const tempExcessC = nozzleTempC - expectedTempC;

  // Rolling residual statistics against calibrated nominal transducer sigma
  const residualWindow = [...state.residualWindow.slice(-24), chamberPressureRawBar - chamberPressureModelBar];
  const windowMean = residualWindow.reduce((acc, v) => acc + v, 0) / residualWindow.length;
  const windowVar =
    residualWindow.reduce((acc, v) => acc + Math.pow(v - windowMean, 2), 0) / residualWindow.length;
  const windowStd = Math.sqrt(windowVar);

  const baselineSigma = Math.max(0.18, profile.nominalNoiseSigmaBar * 1.4);
  const pressureZScore = pressureResidualBar / baselineSigma;
  const noiseElevationRatio = windowStd / profile.nominalNoiseSigmaBar;

  // Composite health penalty across subsystems
  let penalty = 0;

  // Pressure residual deviation penalty
  const absZ = Math.abs(pressureZScore);
  if (absZ > 1.8) {
    penalty += Math.min(48, (absZ - 1.8) * 7.8);
  }
  // High-frequency sensor noise anomaly penalty
  if (noiseElevationRatio > 1.9) {
    penalty += Math.min(24, (noiseElevationRatio - 1.9) * 9.5);
  }
  // Mass flow mismatch / micro-leak penalty
  const leakThresholdGs = profile.id === 'geo-440n' ? 4.5 : 0.45;
  if (Math.abs(massFlowResidualGs) > leakThresholdGs) {
    const normalizedLeak = Math.abs(massFlowResidualGs) / leakThresholdGs;
    penalty += Math.min(42, (normalizedLeak - 1) * 14);
  }
  // Rapid tank pressure decay penalty
  if (tankDecayRateBarPerSec < -0.045) {
    penalty += Math.min(26, Math.abs(tankDecayRateBarPerSec + 0.045) * 260);
  }
  // Thermal margin penalty
  if (nozzleTempC > profile.safeTempLimitC - 40) {
    penalty += Math.min(35, (nozzleTempC - (profile.safeTempLimitC - 40)) * 0.28);
  }
  if (tempExcessC > 55) {
    penalty += Math.min(26, (tempExcessC - 55) * 0.18);
  }
  // Valve latency penalty (either fault or operator slider)
  if (effectiveLatencyMs > 28) {
    penalty += Math.min(25, (effectiveLatencyMs - 28) * 1.05);
  }
  // Safe chamber pressure band breach
  if (controls.dutyCyclePct > 10 && chamberPressureKalmanBar > profile.safePcMaxBar) {
    penalty += Math.min(28, (chamberPressureKalmanBar - profile.safePcMaxBar) * 14);
  }
  if (controls.dutyCyclePct > 10 && chamberPressureKalmanBar < profile.safePcMinBar) {
    penalty += Math.min(24, (profile.safePcMinBar - chamberPressureKalmanBar) * 14);
  }
  // Low tank pressure warning
  if (tankPressureBar < 12.2) {
    penalty += Math.min(22, (12.2 - tankPressureBar) * 8);
  }
  // Low propellant reserve
  if (remainingPropellantPct < 15) {
    penalty += Math.min(25, (15 - remainingPropellantPct) * 1.8);
  }

  const healthScore = Math.round(clamp(100 - penalty, 8, 100));

  let status: SystemStatus = 'NOMINAL';
  if (healthScore < 65) {
    status = 'CRITICAL FAULT';
  } else if (healthScore < 86) {
    status = 'WARNING';
  }

  // 10. Automated Subsystem Fault Classifier (Debounced Event Logging)
  let newLog: DiagnosticLogEntry | null = null;
  let nextLastLoggedKey = state.lastLoggedKey;
  let nextLastLoggedElapsed = state.lastLoggedElapsedSec;

  const canLog = (key: string, cooldownSec = 7.5) =>
    key !== state.lastLoggedKey || elapsedSec - state.lastLoggedElapsedSec >= cooldownSec;

  const makeLog = (
    key: string,
    severity: DiagnosticLogEntry['severity'],
    subsystem: string,
    title: string,
    rootCause: string,
    correctiveAction: string,
    faultCode: string
  ): DiagnosticLogEntry => {
    nextLastLoggedKey = key;
    nextLastLoggedElapsed = elapsedSec;
    return {
      id: `${seq}-${key}-${nowMs}`,
      timestamp: formatUtcTime(nowMs),
      elapsedSec,
      severity,
      subsystem,
      title,
      rootCause,
      correctiveAction,
      faultCode,
    };
  };

  if (
    faultMode === 'transducer-drift' &&
    pressureResidualBar > 1.0 &&
    canLog('idpt-drift', 8)
  ) {
    newLog = makeLog(
      'idpt-drift',
      pressureResidualBar > 1.45 ? 'CRITICAL' : 'WARNING',
      'IDPT Pressure Sensor',
      `IDPT Transducer Drift Detected: +${pressureResidualBar.toFixed(2)} bar residual offset`,
      `Measured chamber pressure diverges from coupled physics model by Z = +${pressureZScore.toFixed(1)}σ with ${(noiseElevationRatio).toFixed(1)}x elevated high-frequency sensor noise, while nozzle thermal balance remains nominal.`,
      'Switch telemetry bus to redundant IDPT Channel B, apply zero-point recalibration offset, and inhibit closed-loop pressure throttling.',
      'ERR-IDPT-402'
    );
  } else if (
    faultMode === 'micro-leak' &&
    Math.abs(massFlowResidualGs) > leakThresholdGs * 1.6 &&
    canLog('propellant-leak', 8)
  ) {
    newLog = makeLog(
      'propellant-leak',
      tankDecayRateBarPerSec < -0.06 ? 'CRITICAL' : 'WARNING',
      'Propellant Feed Manifold',
      `Propellant Line Micro-Leak: +${massFlowResidualGs.toFixed(2)} g/s flow mismatch (${tankDecayRateBarPerSec.toFixed(2)} bar/s decay)`,
      `Upstream feed-line mass flow exceeds predicted throat consumption by ${massFlowResidualGs.toFixed(2)} g/s accompanied by sustained tank ullage pressure decay.`,
      'Close upstream Latch Valve LV-1 to isolate primary manifold branch, cross-check pressure transducer PT-2, and transition to redundant feed leg.',
      'ERR-FEED-219'
    );
  } else if (
    faultMode === 'valve-sticking' &&
    (effectiveLatencyMs > 30 || tempExcessC > 65) &&
    canLog('valve-sticking', 8)
  ) {
    const lagDelta = Math.round(effectiveLatencyMs - profile.nominalLatencyMs);
    newLog = makeLog(
      'valve-sticking',
      tempExcessC > 110 || nozzleTempC > profile.safeTempLimitC ? 'CRITICAL' : 'WARNING',
      'Injector Solenoid Valve',
      `Valve Actuation Lag: Chamber pressure rise delayed by ${lagDelta} ms (+${Math.round(tempExcessC)} °C throat spike)`,
      `Solenoid armature stiction detected (${effectiveLatencyMs.toFixed(0)} ms opening response). Chamber pressure sags ${pressureResidualBar.toFixed(2)} bar below model while catalyst bed / throat experiences thermal excursion.`,
      'Issue high-current solenoid pull-in pulse, throttle duty cycle below 25% to protect nozzle throat, and prepare AOCS switchover to redundant thruster.',
      'ERR-VALV-308'
    );
  } else if (
    faultMode === 'normal' &&
    nozzleTempC > profile.safeTempLimitC &&
    canLog('manual-overtemp', 9)
  ) {
    newLog = makeLog(
      'manual-overtemp',
      'WARNING',
      'Nozzle Thermal Control',
      `Nozzle Throat Thermal Limit Exceeded: ${nozzleTempC.toFixed(0)} °C (limit ${profile.safeTempLimitC} °C)`,
      `Sustained ${controls.dutyCyclePct}% duty cycle and ${controls.tankPressureSetBar.toFixed(1)} bar feed pressure pushed radiative throat temperature above qualification envelope.`,
      'Reduce thruster pulse duty cycle or insert minimum 15-second radiative cooldown window between burns.',
      'WRN-THRM-104'
    );
  } else if (
    faultMode === 'normal' &&
    controls.valveLatencyMs >= 34 &&
    canLog('manual-high-latency', 9)
  ) {
    newLog = makeLog(
      'manual-high-latency',
      'WARNING',
      'Injector Solenoid Valve',
      `Elevated Injector Opening Latency: ${controls.valveLatencyMs} ms configured`,
      `Valve opening response exceeds nominal 12–20 ms specification, degrading impulse-bit repeatability and Specific Impulse (${ispSec.toFixed(1)} s).`,
      'Inspect solenoid coil resistance and bus voltage regulation; verify valve seat temperature is above freezing margin.',
      'WRN-VALV-112'
    );
  } else if (
    faultMode === 'normal' &&
    tankPressureBar < 12.0 &&
    canLog('manual-low-tank', 9)
  ) {
    newLog = makeLog(
      'manual-low-tank',
      'WARNING',
      'Pressurant Ullage System',
      `Low Propellant Tank Pressure: ${tankPressureBar.toFixed(2)} bar`,
      `Feed pressure approaching blowdown lower boundary, reducing chamber pressure (${chamberPressureKalmanBar.toFixed(2)} bar) and Specific Impulse margin.`,
      'Verify helium pressurant regulator status or update AOCS burn duration tables for low-pressure blowdown regime.',
      'WRN-TANK-107'
    );
  } else if (
    faultMode === 'normal' &&
    status === 'NOMINAL' &&
    state.lastLoggedKey !== null &&
    state.lastLoggedKey !== 'nominal-restored' &&
    elapsedSec - state.lastLoggedElapsedSec > 1.0
  ) {
    newLog = makeLog(
      'nominal-restored',
      'INFO',
      'Propulsion Diagnostics',
      'All Subsystems Nominal — Baseline Telemetry Restored',
      `Chamber pressure residual settled within ±${Math.abs(pressureResidualBar).toFixed(2)} bar (Z = ${pressureZScore.toFixed(2)}σ) and mass-balance divergence cleared.`,
      'Continue scheduled AOCS firing profile under autonomous Kalman monitoring.',
      'INF-SYS-000'
    );
  }

  const sample: TelemetrySample = {
    seq,
    timestampMs: nowMs,
    elapsedSec,
    missionId: profileId,
    faultMode,
    tankPressureBar,
    chamberPressureModelBar,
    chamberPressureTrueBar,
    chamberPressureRawBar,
    chamberPressureKalmanBar,
    chamberPressureEmaBar,
    nozzleTempC,
    expectedTempC,
    massFlowMeasuredGs,
    massFlowExpectedGs,
    remainingPropellantPct,
    ispSec,
    thrustN,
    effectiveLatencyMs,
    pressureResidualBar,
    massFlowResidualGs,
    pressureZScore,
    healthScore,
    status,
  };

  const nextState: SimulationEngineState = {
    seq,
    elapsedSec,
    faultElapsedSec,
    currentTankPressureBar: tankPressureBar,
    tankPressureDecayAccumBar: tankDecayAccum,
    currentChamberPressureTrueBar: chamberPressureTrueBar,
    currentNozzleTempC: nozzleTempC,
    remainingPropellantKg,
    kalmanEstimate: chamberPressureKalmanBar,
    kalmanCovariance: nextKalmanCov,
    emaEstimate: chamberPressureEmaBar,
    residualWindow,
    tankPressureHistory: tankHistory,
    lastLoggedKey: nextLastLoggedKey,
    lastLoggedElapsedSec: nextLastLoggedElapsed,
  };

  return { sample, nextState, newLog };
}

/**
 * Generate a CSV telemetry export report from the accumulated telemetry samples.
 */
export function generateTelemetryCsv(
  samples: TelemetrySample[],
  profile: MissionProfileConfig
): string {
  const headers = [
    'Seq',
    'Timestamp_UTC',
    'Elapsed_Sec',
    'Mission_Profile',
    'Fault_Scenario',
    'System_Status',
    'Health_Score_Pct',
    'Tank_Pressure_Bar',
    'Chamber_Pressure_Model_Bar',
    'Chamber_Pressure_Raw_IDPT_Bar',
    'Chamber_Pressure_Kalman_Bar',
    'Chamber_Pressure_EMA_Bar',
    'Pressure_Residual_Bar',
    'Pressure_Z_Score',
    'Nozzle_Temp_C',
    'Mass_Flow_Measured_g_s',
    'Mass_Flow_Expected_g_s',
    'Mass_Flow_Residual_g_s',
    'Specific_Impulse_Isp_s',
    'Thrust_N',
    'Effective_Valve_Latency_ms',
    'Remaining_Propellant_Pct',
  ];

  const rows = samples.map((s) =>
    [
      s.seq,
      formatUtcTime(s.timestampMs),
      s.elapsedSec.toFixed(1),
      `"${profile.name}"`,
      s.faultMode,
      s.status,
      s.healthScore,
      s.tankPressureBar.toFixed(3),
      s.chamberPressureModelBar.toFixed(3),
      s.chamberPressureRawBar.toFixed(3),
      s.chamberPressureKalmanBar.toFixed(3),
      s.chamberPressureEmaBar.toFixed(3),
      s.pressureResidualBar.toFixed(3),
      s.pressureZScore.toFixed(2),
      s.nozzleTempC.toFixed(1),
      s.massFlowMeasuredGs.toFixed(3),
      s.massFlowExpectedGs.toFixed(3),
      s.massFlowResidualGs.toFixed(3),
      s.ispSec.toFixed(1),
      s.thrustN.toFixed(2),
      s.effectiveLatencyMs.toFixed(1),
      s.remainingPropellantPct.toFixed(2),
    ].join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}
