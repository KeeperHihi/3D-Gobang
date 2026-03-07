import type { RenderBootstrapPhase } from "./renderBootstrap";

export type AdaptiveTickIntervalMs = 250 | 500 | 1000;
export type AdaptiveTickReason =
  | "boot"
  | "turn-urgent"
  | "turn-mid"
  | "reconnect-urgent"
  | "reconnect-mid"
  | "idle"
  | "hold";

export interface AdaptiveTickTargetInput {
  renderBootstrapPhase: RenderBootstrapPhase;
  turnRemainingMs: number | null;
  opponentReconnectRemainingMs: number | null;
  timeoutAssistThresholdMs: number;
}

export interface AdaptiveTickTarget {
  intervalMs: AdaptiveTickIntervalMs;
  reason: Exclude<AdaptiveTickReason, "hold">;
}

export interface AdaptiveTickInput extends AdaptiveTickTargetInput {
  nowMs: number;
  currentIntervalMs: AdaptiveTickIntervalMs;
  currentIntervalStartedAtMs: number;
}

export interface AdaptiveTickDecision {
  intervalMs: AdaptiveTickIntervalMs;
  switched: boolean;
  reason: AdaptiveTickReason;
}

export const ADAPTIVE_TICK_FAST_MS: AdaptiveTickIntervalMs = 250;
export const ADAPTIVE_TICK_MEDIUM_MS: AdaptiveTickIntervalMs = 500;
export const ADAPTIVE_TICK_SLOW_MS: AdaptiveTickIntervalMs = 1000;

export const ADAPTIVE_TICK_SWITCH_MIN_HOLD_MS = 1500;
export const ADAPTIVE_TICK_TURN_URGENT_MS = 8000;
export const ADAPTIVE_TICK_TURN_MEDIUM_MS = 20000;
export const ADAPTIVE_TICK_RECONNECT_URGENT_MS = 12000;
export const ADAPTIVE_TICK_RECONNECT_MEDIUM_MS = 30000;
export const ADAPTIVE_TICK_TIMEOUT_GUARD_BUFFER_MS = 1500;

function normalizeRemainingMs(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.floor(value));
}

export function selectAdaptiveTickTarget(input: AdaptiveTickTargetInput): AdaptiveTickTarget {
  if (input.renderBootstrapPhase === "boot") {
    return {
      intervalMs: ADAPTIVE_TICK_FAST_MS,
      reason: "boot"
    };
  }

  const turnRemainingMs = normalizeRemainingMs(input.turnRemainingMs);
  const reconnectRemainingMs = normalizeRemainingMs(input.opponentReconnectRemainingMs);
  const timeoutGuardMs =
    Math.max(0, Math.floor(input.timeoutAssistThresholdMs)) + ADAPTIVE_TICK_TIMEOUT_GUARD_BUFFER_MS;
  const urgentTurnWindowMs = Math.max(ADAPTIVE_TICK_TURN_URGENT_MS, timeoutGuardMs);

  if (turnRemainingMs !== null) {
    if (turnRemainingMs <= urgentTurnWindowMs) {
      return {
        intervalMs: ADAPTIVE_TICK_FAST_MS,
        reason: "turn-urgent"
      };
    }
    if (turnRemainingMs <= ADAPTIVE_TICK_TURN_MEDIUM_MS) {
      return {
        intervalMs: ADAPTIVE_TICK_MEDIUM_MS,
        reason: "turn-mid"
      };
    }
  }

  if (reconnectRemainingMs !== null) {
    if (reconnectRemainingMs <= ADAPTIVE_TICK_RECONNECT_URGENT_MS) {
      return {
        intervalMs: ADAPTIVE_TICK_FAST_MS,
        reason: "reconnect-urgent"
      };
    }
    if (reconnectRemainingMs <= ADAPTIVE_TICK_RECONNECT_MEDIUM_MS) {
      return {
        intervalMs: ADAPTIVE_TICK_MEDIUM_MS,
        reason: "reconnect-mid"
      };
    }
  }

  return {
    intervalMs: ADAPTIVE_TICK_SLOW_MS,
    reason: "idle"
  };
}

export function evaluateAdaptiveTick(input: AdaptiveTickInput): AdaptiveTickDecision {
  const target = selectAdaptiveTickTarget(input);
  if (target.intervalMs === input.currentIntervalMs) {
    return {
      intervalMs: input.currentIntervalMs,
      switched: false,
      reason: target.reason
    };
  }

  const elapsedSinceCurrentMs = Math.max(0, Math.floor(input.nowMs - input.currentIntervalStartedAtMs));
  const switchingToHigherFrequency = target.intervalMs < input.currentIntervalMs;
  if (
    !switchingToHigherFrequency &&
    elapsedSinceCurrentMs < ADAPTIVE_TICK_SWITCH_MIN_HOLD_MS
  ) {
    return {
      intervalMs: input.currentIntervalMs,
      switched: false,
      reason: "hold"
    };
  }

  return {
    intervalMs: target.intervalMs,
    switched: true,
    reason: target.reason
  };
}
