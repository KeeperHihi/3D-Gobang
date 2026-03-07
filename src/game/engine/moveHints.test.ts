import { describe, expect, it } from "vitest";
import { createBoard, toLinearIndex, writeCell } from "./board";
import { analyzeMoveHints } from "./moveHints";

describe("analyzeMoveHints", () => {
  it("prioritizes immediate winning move for current player", () => {
    const size = 5;
    const connect = 5;
    const board = createBoard(size);
    writeCell(board, { x: 0, y: 0, z: 0 }, "X", size);
    writeCell(board, { x: 1, y: 0, z: 0 }, "X", size);
    writeCell(board, { x: 2, y: 0, z: 0 }, "X", size);
    writeCell(board, { x: 3, y: 0, z: 0 }, "X", size);
    writeCell(board, { x: 4, y: 4, z: 4 }, "O", size);

    const hints = analyzeMoveHints(board, "X", size, connect);
    expect(hints.winningMoves.length).toBeGreaterThan(0);
    expect(hints.recommendedMoves[0].priority).toBe("win");
    expect(hints.recommendedMoves[0].index).toBe(toLinearIndex({ x: 4, y: 0, z: 0 }, size));
  });

  it("prioritizes blocking move when opponent has one-step win", () => {
    const size = 5;
    const connect = 5;
    const board = createBoard(size);
    writeCell(board, { x: 2, y: 0, z: 2 }, "O", size);
    writeCell(board, { x: 2, y: 1, z: 2 }, "O", size);
    writeCell(board, { x: 2, y: 2, z: 2 }, "O", size);
    writeCell(board, { x: 2, y: 3, z: 2 }, "O", size);
    writeCell(board, { x: 0, y: 0, z: 0 }, "X", size);

    const hints = analyzeMoveHints(board, "X", size, connect);
    expect(hints.winningMoves.length).toBe(0);
    expect(hints.blockingMoves.length).toBeGreaterThan(0);
    expect(hints.recommendedMoves[0].priority).toBe("block");
    expect(hints.recommendedMoves[0].index).toBe(toLinearIndex({ x: 2, y: 4, z: 2 }, size));
  });

  it("returns center-first recommendation in neutral opening", () => {
    const size = 5;
    const connect = 5;
    const board = createBoard(size);
    const hints = analyzeMoveHints(board, "X", size, connect);

    expect(hints.winningMoves).toHaveLength(0);
    expect(hints.blockingMoves).toHaveLength(0);
    expect(hints.recommendedMoves[0].priority).toBe("best");
    expect(hints.recommendedMoves[0].index).toBe(toLinearIndex({ x: 2, y: 2, z: 2 }, size));
  });

  it("does not mutate board data during analysis", () => {
    const size = 5;
    const connect = 5;
    const board = createBoard(size);
    writeCell(board, { x: 0, y: 0, z: 0 }, "X", size);
    writeCell(board, { x: 1, y: 1, z: 1 }, "O", size);
    const frozenBoard = Object.freeze([...board]) as typeof board;

    expect(() => analyzeMoveHints(frozenBoard, "X", size, connect)).not.toThrow();

    const hints = analyzeMoveHints(frozenBoard, "X", size, connect);
    expect(hints.recommendedMoves.length).toBeGreaterThan(0);
  });
});
