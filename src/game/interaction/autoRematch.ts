import type { Winner } from "../../network/protocol";

export type AutoRematchPhase = "idle" | "countdown" | "armed" | "cancelled";

export interface AutoRematchRoundKeyInput {
  roomId: string;
  winner: Winner;
  lastMoveNumber: number | null;
  lastMoveTimestamp: number | null;
}

export interface AutoRematchDecisionInput {
  enabled: boolean;
  winner: Winner;
  opponentConnected: boolean;
  canContinueMatch: boolean;
  myRematchReady: boolean;
  countdownStartedAtMs: number | null;
  nowMs: number;
  alreadyCancelled: boolean;
  alreadyTriggered: boolean;
  countdownMs?: number;
}

export interface AutoRematchDecision {
  phase: AutoRematchPhase;
  shouldStartCountdown: boolean;
  shouldAutoRematch: boolean;
  canCancel: boolean;
  countdownRemainingMs: number | null;
}

export const AUTO_REMATCH_COUNTDOWN_MS = 2_800;

function canAutoRematch(input: AutoRematchDecisionInput): boolean {
  return Boolean(input.winner) && input.opponentConnected && !input.canContinueMatch;
}

export function createAutoRematchRoundKey(input: AutoRematchRoundKeyInput): string {
  return `${input.roomId}:${input.winner ?? "ongoing"}:${input.lastMoveNumber ?? 0}:${input.lastMoveTimestamp ?? 0}`;
}

export function evaluateAutoRematch(input: AutoRematchDecisionInput): AutoRematchDecision {
  if (!canAutoRematch(input)) {
    return {
      phase: "idle",
      shouldStartCountdown: false,
      shouldAutoRematch: false,
      canCancel: false,
      countdownRemainingMs: null
    };
  }

  if (!input.enabled) {
    return {
      phase: "idle",
      shouldStartCountdown: false,
      shouldAutoRematch: false,
      canCancel: false,
      countdownRemainingMs: null
    };
  }

  if (input.myRematchReady || input.alreadyTriggered) {
    return {
      phase: "armed",
      shouldStartCountdown: false,
      shouldAutoRematch: false,
      canCancel: false,
      countdownRemainingMs: null
    };
  }

  if (input.alreadyCancelled) {
    return {
      phase: "cancelled",
      shouldStartCountdown: false,
      shouldAutoRematch: false,
      canCancel: false,
      countdownRemainingMs: null
    };
  }

  const countdownMs = input.countdownMs ?? AUTO_REMATCH_COUNTDOWN_MS;
  if (input.countdownStartedAtMs === null) {
    return {
      phase: "countdown",
      shouldStartCountdown: true,
      shouldAutoRematch: false,
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
      shouldAutoRematch: false,
      canCancel: true,
      countdownRemainingMs: remainingMs
    };
  }

  return {
    phase: "armed",
    shouldStartCountdown: false,
    shouldAutoRematch: true,
    canCancel: false,
    countdownRemainingMs: 0
  };
}
