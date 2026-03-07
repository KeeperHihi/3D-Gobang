import type { RematchWaitPhase } from "./rematchWait";

export type AutoContinueAfterFallbackPhase = "idle" | "countdown" | "armed" | "cancelled";

export interface AutoContinueAfterFallbackRoundKeyInput {
  roomId: string;
  winner: "X" | "O" | "draw" | null;
  lastMoveNumber: number | null;
  lastMoveTimestamp: number | null;
}

export interface AutoContinueAfterFallbackInput {
  enabled: boolean;
  rematchWaitPhase: RematchWaitPhase;
  canContinueMatch: boolean;
  continueSubmitting: boolean;
  countdownStartedAtMs: number | null;
  nowMs: number;
  alreadyCancelled: boolean;
  alreadyTriggered: boolean;
  countdownMs?: number;
}

export interface AutoContinueAfterFallbackDecision {
  phase: AutoContinueAfterFallbackPhase;
  shouldStartCountdown: boolean;
  shouldAutoContinue: boolean;
  canCancel: boolean;
  countdownRemainingMs: number | null;
}

export const AUTO_CONTINUE_AFTER_FALLBACK_COUNTDOWN_MS = 2_800;

function canAutoContinueAfterFallback(input: AutoContinueAfterFallbackInput): boolean {
  return input.rematchWaitPhase === "fallback-ready" && input.canContinueMatch;
}

export function createAutoContinueAfterFallbackRoundKey(
  input: AutoContinueAfterFallbackRoundKeyInput
): string {
  return `${input.roomId}:${input.winner ?? "ongoing"}:${input.lastMoveNumber ?? 0}:${input.lastMoveTimestamp ?? 0}`;
}

export function evaluateAutoContinueAfterFallback(
  input: AutoContinueAfterFallbackInput
): AutoContinueAfterFallbackDecision {
  if (!input.enabled || !canAutoContinueAfterFallback(input)) {
    return {
      phase: "idle",
      shouldStartCountdown: false,
      shouldAutoContinue: false,
      canCancel: false,
      countdownRemainingMs: null
    };
  }

  if (input.alreadyCancelled) {
    return {
      phase: "cancelled",
      shouldStartCountdown: false,
      shouldAutoContinue: false,
      canCancel: false,
      countdownRemainingMs: null
    };
  }

  if (input.continueSubmitting || input.alreadyTriggered) {
    return {
      phase: "armed",
      shouldStartCountdown: false,
      shouldAutoContinue: false,
      canCancel: false,
      countdownRemainingMs: null
    };
  }

  const countdownMs = input.countdownMs ?? AUTO_CONTINUE_AFTER_FALLBACK_COUNTDOWN_MS;
  if (input.countdownStartedAtMs === null) {
    return {
      phase: "countdown",
      shouldStartCountdown: true,
      shouldAutoContinue: false,
      canCancel: true,
      countdownRemainingMs: countdownMs
    };
  }

  const elapsedMs = Math.max(0, input.nowMs - input.countdownStartedAtMs);
  const remainingMs = Math.max(0, countdownMs - elapsedMs);
  if (remainingMs > 0) {
    return {
      phase: "countdown",
      shouldStartCountdown: false,
      shouldAutoContinue: false,
      canCancel: true,
      countdownRemainingMs: remainingMs
    };
  }

  return {
    phase: "armed",
    shouldStartCountdown: false,
    shouldAutoContinue: true,
    canCancel: false,
    countdownRemainingMs: 0
  };
}
