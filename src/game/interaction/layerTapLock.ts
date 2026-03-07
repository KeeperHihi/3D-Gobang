import type { Coordinate3D } from "../../network/protocol";

export interface LayerTapLock {
  coordinate: Coordinate3D;
  expiresAtMs: number;
}

export interface CreateLayerTapLockInput {
  coordinate: Coordinate3D;
  nowMs: number;
  ttlMs: number;
}

export type LayerTapLockReason =
  | "none"
  | "ready"
  | "expired"
  | "cannot-place"
  | "occupied"
  | "out-of-bounds";

export interface EvaluateLayerTapLockInput {
  lock: LayerTapLock | null;
  nowMs: number;
  canPlace: boolean;
  board: number[];
  boardSize: number;
}

export interface LayerTapLockDecision {
  lock: LayerTapLock | null;
  canConfirm: boolean;
  reason: LayerTapLockReason;
}

function toLinearIndex(coordinate: Coordinate3D, size: number): number | null {
  const { x, y, z } = coordinate;
  if (x < 0 || y < 0 || z < 0 || x >= size || y >= size || z >= size) {
    return null;
  }
  return x + y * size + z * size * size;
}

export function createLayerTapLock(input: CreateLayerTapLockInput): LayerTapLock {
  const ttlMs = Math.max(0, input.ttlMs);
  return {
    coordinate: { ...input.coordinate },
    expiresAtMs: input.nowMs + ttlMs
  };
}

export function evaluateLayerTapLock(input: EvaluateLayerTapLockInput): LayerTapLockDecision {
  if (!input.lock) {
    return {
      lock: null,
      canConfirm: false,
      reason: "none"
    };
  }

  if (input.nowMs >= input.lock.expiresAtMs) {
    return {
      lock: null,
      canConfirm: false,
      reason: "expired"
    };
  }

  if (!input.canPlace) {
    return {
      lock: null,
      canConfirm: false,
      reason: "cannot-place"
    };
  }

  const index = toLinearIndex(input.lock.coordinate, input.boardSize);
  if (index === null) {
    return {
      lock: null,
      canConfirm: false,
      reason: "out-of-bounds"
    };
  }
  if (input.board[index] !== 0) {
    return {
      lock: null,
      canConfirm: false,
      reason: "occupied"
    };
  }

  return {
    lock: input.lock,
    canConfirm: true,
    reason: "ready"
  };
}
