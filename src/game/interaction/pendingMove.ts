import type { Coordinate3D, PlayerMark, RoomSnapshot } from "../../network/protocol";

export const PENDING_MOVE_STALE_TIMEOUT_MS = 7000;

export interface PendingMoveState {
  clientMoveId: string;
  coordinate: Coordinate3D;
  player: PlayerMark;
  status: "pending" | "accepted";
  roomMoveNumber?: number;
  submittedAt: number;
}

export interface PendingMoveReconcileResult {
  pendingMove: PendingMoveState | null;
  shouldDropTracking: boolean;
}

function coordinateEquals(left: Coordinate3D, right: Coordinate3D): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

export function shouldClearPendingMove(snapshot: RoomSnapshot, pendingMove: PendingMoveState): boolean {
  const boardIndex =
    pendingMove.coordinate.x +
    pendingMove.coordinate.y * snapshot.size +
    pendingMove.coordinate.z * snapshot.size * snapshot.size;
  const expectedCellValue = pendingMove.player === "X" ? 1 : 2;

  if (snapshot.board[boardIndex] === expectedCellValue) {
    return true;
  }

  if (
    snapshot.lastMove &&
    snapshot.lastMove.player === pendingMove.player &&
    coordinateEquals(snapshot.lastMove, pendingMove.coordinate)
  ) {
    return true;
  }

  if (
    pendingMove.status === "accepted" &&
    pendingMove.roomMoveNumber &&
    snapshot.lastMove &&
    snapshot.lastMove.moveNumber >= pendingMove.roomMoveNumber
  ) {
    return true;
  }

  return false;
}

export function reconcilePendingMove(
  snapshot: RoomSnapshot,
  pendingMove: PendingMoveState | null
): PendingMoveReconcileResult {
  if (!pendingMove) {
    return {
      pendingMove: null,
      shouldDropTracking: false
    };
  }

  if (shouldClearPendingMove(snapshot, pendingMove)) {
    return {
      pendingMove: null,
      shouldDropTracking: true
    };
  }

  return {
    pendingMove,
    shouldDropTracking: false
  };
}

export function isPendingMoveStale(
  pendingMove: PendingMoveState,
  now: number = Date.now(),
  staleTimeoutMs: number = PENDING_MOVE_STALE_TIMEOUT_MS
): boolean {
  if (pendingMove.status !== "pending") {
    return false;
  }
  return now - pendingMove.submittedAt >= staleTimeoutMs;
}
