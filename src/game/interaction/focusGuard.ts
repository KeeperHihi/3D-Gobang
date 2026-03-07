export type FocusGuardReason = "idle" | "turnHandover" | "urgent";

export interface FocusGuardTurnKeyInput {
  roomId: string;
  turn: "X" | "O";
  lastMoveNumber: number | null;
  turnDeadlineAt: number | null;
}

export interface FocusGuardInput {
  focusMode: "auto" | "manual";
  currentLayer: number;
  autoFocusLayer: number;
  boardSize: number;
  isMyTurn: boolean;
  wasMyTurn: boolean;
  turnRemainingMs: number | null;
  lastManualInputAtMs: number | null;
  nowMs: number;
  alreadyTriggeredThisTurn: boolean;
  urgentThresholdMs?: number;
  intentProtectWindowMs?: number;
}

export interface FocusGuardDecision {
  shouldRestoreAuto: boolean;
  targetLayer: number;
  reason: FocusGuardReason;
}

export const FOCUS_GUARD_URGENT_THRESHOLD_MS = 8_000;
export const FOCUS_GUARD_INTENT_PROTECT_WINDOW_MS = 1_200;

function clampLayer(layer: number, boardSize: number): number {
  return Math.max(0, Math.min(boardSize - 1, layer));
}

function hasRecentManualIntent(
  lastManualInputAtMs: number | null,
  nowMs: number,
  intentProtectWindowMs: number
): boolean {
  if (lastManualInputAtMs === null) {
    return false;
  }
  return Math.max(0, nowMs - lastManualInputAtMs) < intentProtectWindowMs;
}

export function createFocusGuardTurnKey(input: FocusGuardTurnKeyInput): string {
  return `${input.roomId}:${input.turn}:${input.lastMoveNumber ?? 0}:${input.turnDeadlineAt ?? 0}`;
}

export function evaluateFocusGuard(input: FocusGuardInput): FocusGuardDecision {
  const targetLayer = clampLayer(input.autoFocusLayer, input.boardSize);
  if (!input.isMyTurn || input.focusMode !== "manual" || input.currentLayer === targetLayer) {
    return {
      shouldRestoreAuto: false,
      targetLayer,
      reason: "idle"
    };
  }

  if (input.alreadyTriggeredThisTurn) {
    return {
      shouldRestoreAuto: false,
      targetLayer,
      reason: "idle"
    };
  }

  const intentProtectWindowMs = input.intentProtectWindowMs ?? FOCUS_GUARD_INTENT_PROTECT_WINDOW_MS;
  if (hasRecentManualIntent(input.lastManualInputAtMs, input.nowMs, intentProtectWindowMs)) {
    return {
      shouldRestoreAuto: false,
      targetLayer,
      reason: "idle"
    };
  }

  if (!input.wasMyTurn) {
    return {
      shouldRestoreAuto: true,
      targetLayer,
      reason: "turnHandover"
    };
  }

  const urgentThresholdMs = input.urgentThresholdMs ?? FOCUS_GUARD_URGENT_THRESHOLD_MS;
  if (input.turnRemainingMs !== null && input.turnRemainingMs <= urgentThresholdMs) {
    return {
      shouldRestoreAuto: true,
      targetLayer,
      reason: "urgent"
    };
  }

  return {
    shouldRestoreAuto: false,
    targetLayer,
    reason: "idle"
  };
}
