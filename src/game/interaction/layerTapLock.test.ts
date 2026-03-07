import { describe, expect, it } from "vitest";
import {
  createLayerTapLock,
  evaluateLayerTapLock,
  type LayerTapLock
} from "./layerTapLock";

function createBoard(size: number): number[] {
  return new Array(size * size * size).fill(0);
}

function createLock(overrides?: Partial<LayerTapLock>): LayerTapLock {
  return {
    coordinate: { x: 1, y: 2, z: 3 },
    expiresAtMs: 4_000,
    ...overrides
  };
}

describe("layerTapLock", () => {
  it("creates lock with bounded ttl and copied coordinate", () => {
    const coordinate = { x: 2, y: 1, z: 0 };
    const lock = createLayerTapLock({
      coordinate,
      nowMs: 1_000,
      ttlMs: -12
    });

    expect(lock.expiresAtMs).toBe(1_000);
    expect(lock.coordinate).toEqual(coordinate);
    expect(lock.coordinate).not.toBe(coordinate);
  });

  it("keeps lock confirmable while turn is placeable and cell is empty", () => {
    const decision = evaluateLayerTapLock({
      lock: createLock(),
      nowMs: 1_500,
      canPlace: true,
      board: createBoard(5),
      boardSize: 5
    });

    expect(decision.reason).toBe("ready");
    expect(decision.canConfirm).toBe(true);
    expect(decision.lock?.coordinate).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("expires lock once ttl is reached", () => {
    const decision = evaluateLayerTapLock({
      lock: createLock({ expiresAtMs: 2_000 }),
      nowMs: 2_000,
      canPlace: true,
      board: createBoard(5),
      boardSize: 5
    });

    expect(decision.reason).toBe("expired");
    expect(decision.canConfirm).toBe(false);
    expect(decision.lock).toBeNull();
  });

  it("clears lock when current turn cannot place", () => {
    const decision = evaluateLayerTapLock({
      lock: createLock(),
      nowMs: 1_600,
      canPlace: false,
      board: createBoard(5),
      boardSize: 5
    });

    expect(decision.reason).toBe("cannot-place");
    expect(decision.canConfirm).toBe(false);
    expect(decision.lock).toBeNull();
  });

  it("clears lock when target cell is already occupied", () => {
    const board = createBoard(5);
    const coordinate = { x: 2, y: 2, z: 1 };
    const index = coordinate.x + coordinate.y * 5 + coordinate.z * 25;
    board[index] = 1;

    const decision = evaluateLayerTapLock({
      lock: createLock({ coordinate }),
      nowMs: 1_700,
      canPlace: true,
      board,
      boardSize: 5
    });

    expect(decision.reason).toBe("occupied");
    expect(decision.canConfirm).toBe(false);
    expect(decision.lock).toBeNull();
  });

  it("clears lock when coordinate is out of board bounds", () => {
    const decision = evaluateLayerTapLock({
      lock: createLock({ coordinate: { x: 7, y: 0, z: 0 } }),
      nowMs: 1_800,
      canPlace: true,
      board: createBoard(5),
      boardSize: 5
    });

    expect(decision.reason).toBe("out-of-bounds");
    expect(decision.canConfirm).toBe(false);
    expect(decision.lock).toBeNull();
  });
});
