export const FOREGROUND_RECOVERY_STABILIZE_MS = 1_500;
export const FOREGROUND_EMERGENCY_LOW_FPS = 22;

export interface ForegroundFpsTrustInput {
  pageVisible: boolean;
  windowFocused: boolean;
  returnedToForegroundAtMs: number | null;
  nowMs: number;
  stabilizeWindowMs?: number;
}

export interface AdaptiveRenderTuningInput extends ForegroundFpsTrustInput {
  averageFps: number | null;
  emergencyLowFpsThreshold?: number;
}

export interface AdaptiveRenderTuningDecision {
  allow: boolean;
  reason: "background" | "stabilizing" | "trusted_foreground" | "emergency_low_fps";
}

function hasUsableFps(averageFps: number | null): averageFps is number {
  return averageFps !== null && Number.isFinite(averageFps);
}

export function isForegroundFpsTrusted(input: ForegroundFpsTrustInput): boolean {
  if (!input.pageVisible || !input.windowFocused) {
    return false;
  }
  if (input.returnedToForegroundAtMs === null) {
    return true;
  }

  const stabilizeWindowMs = input.stabilizeWindowMs ?? FOREGROUND_RECOVERY_STABILIZE_MS;
  return input.nowMs - input.returnedToForegroundAtMs >= stabilizeWindowMs;
}

export function shouldAllowAdaptiveRenderTuning(
  input: AdaptiveRenderTuningInput
): AdaptiveRenderTuningDecision {
  if (!input.pageVisible || !input.windowFocused) {
    return {
      allow: false,
      reason: "background"
    };
  }

  if (isForegroundFpsTrusted(input)) {
    return {
      allow: true,
      reason: "trusted_foreground"
    };
  }

  const emergencyLowFpsThreshold = input.emergencyLowFpsThreshold ?? FOREGROUND_EMERGENCY_LOW_FPS;
  if (hasUsableFps(input.averageFps) && input.averageFps <= emergencyLowFpsThreshold) {
    return {
      allow: true,
      reason: "emergency_low_fps"
    };
  }

  return {
    allow: false,
    reason: "stabilizing"
  };
}
