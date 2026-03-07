import type { Winner } from "../../network/protocol";

export type RematchWaitPhase = "idle" | "waiting" | "fallback-ready";

export interface RematchWaitRoundKeyInput {
  roomId: string;
  winner: Winner;
  lastMoveNumber: number | null;
  lastMoveTimestamp: number | null;
}

export interface RematchWaitInput {
  winner: Winner;
  myRematchReady: boolean;
  opponentRematchReady: boolean;
  opponentConnected: boolean;
  settlementStartedAtMs: number | null;
  nowMs: number;
  fallbackAfterMs?: number;
}

export interface RematchWaitDecision {
  phase: RematchWaitPhase;
  canForceContinueMatch: boolean;
  remainingMs: number | null;
}

export interface RematchWaitTrackerInput {
  winner: Winner;
  myRematchReady: boolean;
  opponentRematchReady: boolean;
  opponentConnected: boolean;
}

export const REMATCH_WAIT_FALLBACK_AFTER_MS = 12_000;

export function createRematchWaitRoundKey(input: RematchWaitRoundKeyInput): string {
  return `${input.roomId}:${input.winner ?? "ongoing"}:${input.lastMoveNumber ?? 0}:${input.lastMoveTimestamp ?? 0}`;
}

function shouldTrackRematchWait(input: RematchWaitTrackerInput): boolean {
  return Boolean(input.winner) && input.myRematchReady && !input.opponentRematchReady && input.opponentConnected;
}

export function resolveRematchWaitStartedAtMs(
  currentStartedAtMs: number | null,
  input: RematchWaitTrackerInput,
  nowMs: number
): number | null {
  if (!shouldTrackRematchWait(input)) {
    return null;
  }
  return currentStartedAtMs ?? nowMs;
}

export function evaluateRematchWait(input: RematchWaitInput): RematchWaitDecision {
  if (!shouldTrackRematchWait(input)) {
    return {
      phase: "idle",
      canForceContinueMatch: false,
      remainingMs: null
    };
  }

  const fallbackAfterMs = input.fallbackAfterMs ?? REMATCH_WAIT_FALLBACK_AFTER_MS;
  if (input.settlementStartedAtMs === null) {
    return {
      phase: "waiting",
      canForceContinueMatch: false,
      remainingMs: fallbackAfterMs
    };
  }

  const elapsedMs = Math.max(0, input.nowMs - input.settlementStartedAtMs);
  const remainingMs = Math.max(0, fallbackAfterMs - elapsedMs);
  if (remainingMs > 0) {
    return {
      phase: "waiting",
      canForceContinueMatch: false,
      remainingMs
    };
  }

  return {
    phase: "fallback-ready",
    canForceContinueMatch: true,
    remainingMs: 0
  };
}
