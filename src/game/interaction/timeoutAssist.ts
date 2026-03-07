import type { SmartActionState } from "./smartAction";
import type { PlayerMark } from "../../network/protocol";
import type { Coordinate3D } from "../../network/protocol";

export type TimeoutAssistUrgency = "off" | "idle" | "armed" | "triggered";
export type TimeoutAssistNextAction = "none" | "autoAct";
export type TimeoutAssistAutoActSource = "none" | "smartAction" | "fallbackTarget";

export interface TimeoutAssistInput {
  enabled: boolean;
  turnRemainingMs: number | null;
  canPlace: boolean;
  hasPendingMove: boolean;
  smartAction: Pick<SmartActionState, "actionType" | "enabled" | "target">;
  fallbackTarget?: Coordinate3D | null;
  alreadyTriggeredThisTurn: boolean;
  thresholdMs?: number;
}

export interface TimeoutAssistDecision {
  shouldAutoAct: boolean;
  nextAction: TimeoutAssistNextAction;
  autoActSource: TimeoutAssistAutoActSource;
  urgencyLabel: TimeoutAssistUrgency;
  remainingMs: number | null;
}

export interface TimeoutAssistTurnKeyInput {
  roomId: string;
  turn: PlayerMark;
  lastMoveNumber: number | null;
  turnDeadlineAt: number | null;
}

export const DEFAULT_TIMEOUT_ASSIST_THRESHOLD_MS = 2_500;

function isAutoActionType(actionType: SmartActionState["actionType"]): boolean {
  return actionType === "win" || actionType === "block" || actionType === "suggest";
}

export function createTimeoutAssistTurnKey(input: TimeoutAssistTurnKeyInput): string {
  return `${input.roomId}:${input.turn}:${input.lastMoveNumber ?? 0}:${input.turnDeadlineAt ?? 0}`;
}

export function evaluateTimeoutAssist(input: TimeoutAssistInput): TimeoutAssistDecision {
  const thresholdMs = input.thresholdMs ?? DEFAULT_TIMEOUT_ASSIST_THRESHOLD_MS;
  const remainingMs =
    input.turnRemainingMs === null ? null : Math.max(0, Math.floor(input.turnRemainingMs));

  if (!input.enabled) {
    return {
      shouldAutoAct: false,
      nextAction: "none",
      autoActSource: "none",
      urgencyLabel: "off",
      remainingMs
    };
  }

  if (input.alreadyTriggeredThisTurn) {
    return {
      shouldAutoAct: false,
      nextAction: "none",
      autoActSource: "none",
      urgencyLabel: "triggered",
      remainingMs
    };
  }

  if (remainingMs === null || !input.canPlace || input.hasPendingMove) {
    return {
      shouldAutoAct: false,
      nextAction: "none",
      autoActSource: "none",
      urgencyLabel: "idle",
      remainingMs
    };
  }

  if (remainingMs > thresholdMs) {
    return {
      shouldAutoAct: false,
      nextAction: "none",
      autoActSource: "none",
      urgencyLabel: "idle",
      remainingMs
    };
  }

  const canAutoAct =
    input.smartAction.enabled &&
    input.smartAction.target !== null &&
    isAutoActionType(input.smartAction.actionType);
  if (canAutoAct) {
    return {
      shouldAutoAct: true,
      nextAction: "autoAct",
      autoActSource: "smartAction",
      urgencyLabel: "armed",
      remainingMs
    };
  }

  if (input.fallbackTarget) {
    return {
      shouldAutoAct: true,
      nextAction: "autoAct",
      autoActSource: "fallbackTarget",
      urgencyLabel: "armed",
      remainingMs
    };
  }

  return {
    shouldAutoAct: false,
    nextAction: "none",
    autoActSource: "none",
    urgencyLabel: "idle",
    remainingMs
  };
}
