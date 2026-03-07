import type { PlayerMark, Winner } from "../../network/protocol";

export type TurnNudgeConnectionStatus = "connecting" | "online" | "reconnecting" | "offline";

export interface TurnNudgeTurnKeyInput {
  roomId: string;
  turn: PlayerMark;
  winner: Winner;
  lastMoveNumber: number | null;
  turnDeadlineAt: number | null;
}

export interface TurnNudgeDecisionInput {
  enabled: boolean;
  connectionStatus: TurnNudgeConnectionStatus;
  winner: Winner;
  isMyTurn: boolean;
  wasMyTurn: boolean;
  canPlace: boolean;
  pageVisible: boolean;
  windowFocused: boolean;
  alreadyNudgedThisTurn: boolean;
}

export function createTurnNudgeTurnKey(input: TurnNudgeTurnKeyInput): string {
  return `${input.roomId}:${input.winner ?? "ongoing"}:${input.turn}:${input.lastMoveNumber ?? 0}:${input.turnDeadlineAt ?? 0}`;
}

export function shouldTriggerTurnNudge(input: TurnNudgeDecisionInput): boolean {
  if (!input.enabled) {
    return false;
  }
  if (input.connectionStatus !== "online") {
    return false;
  }
  if (input.winner !== null) {
    return false;
  }
  if (!input.isMyTurn || input.wasMyTurn) {
    return false;
  }
  if (!input.canPlace) {
    return false;
  }
  if (input.alreadyNudgedThisTurn) {
    return false;
  }
  if (input.pageVisible && input.windowFocused) {
    return false;
  }
  return true;
}
