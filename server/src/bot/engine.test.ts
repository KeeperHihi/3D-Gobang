import { describe, expect, it } from "vitest";
import { createBoard, toLinearIndex } from "../../../shared/game/board";
import { createWinLinesIndex } from "../../../shared/game/winLines";
import type { PlayerMark } from "../../../shared/network/protocol";
import { chooseBestBotMove } from "./engine";

interface Fixture {
  size: number;
  connect: number;
  board: ReturnType<typeof createBoard>;
  index: (x: number, y: number, z: number) => number;
}

function createFixture(size: number = 5, connect: number = 5): Fixture {
  return {
    size,
    connect,
    board: createBoard(size),
    index: (x, y, z) => toLinearIndex({ x, y, z }, size)
  };
}

function placeLine(
  board: ReturnType<typeof createBoard>,
  index: (x: number, y: number, z: number) => number,
  mark: PlayerMark,
  points: Array<[number, number, number]>
): void {
  const value = mark === "X" ? 1 : 2;
  for (const [x, y, z] of points) {
    board[index(x, y, z)] = value;
  }
}

describe("chooseBestBotMove", () => {
  it("plays immediate winning move when available", () => {
    const { size, connect, board, index } = createFixture();
    placeLine(
      board,
      index,
      "O",
      [
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
        [3, 0, 0]
      ]
    );
    board[index(2, 2, 2)] = 1;

    const decision = chooseBestBotMove({
      board,
      size,
      connect,
      winLinesIndex: createWinLinesIndex(size, connect),
      botMark: "O",
      timeBudgetMs: 200
    });

    expect(decision.coordinate).toEqual({ x: 4, y: 0, z: 0 });
    expect(decision.searchedDepth).toBe(1);
  });

  it("blocks opponent immediate win before building own plan", () => {
    const { size, connect, board, index } = createFixture();
    placeLine(
      board,
      index,
      "X",
      [
        [0, 1, 0],
        [1, 1, 0],
        [2, 1, 0],
        [3, 1, 0]
      ]
    );
    placeLine(
      board,
      index,
      "O",
      [
        [0, 0, 0],
        [1, 0, 0]
      ]
    );

    const decision = chooseBestBotMove({
      board,
      size,
      connect,
      winLinesIndex: createWinLinesIndex(size, connect),
      botMark: "O",
      timeBudgetMs: 200
    });

    expect(decision.coordinate).toEqual({ x: 4, y: 1, z: 0 });
    expect(decision.searchedDepth).toBe(1);
  });

  it("returns legal move under tight time budget via fallback", () => {
    const { size, connect, board, index } = createFixture(8, 5);
    placeLine(
      board,
      index,
      "X",
      [
        [3, 3, 3],
        [3, 4, 3],
        [4, 3, 3],
        [4, 4, 3]
      ]
    );
    placeLine(
      board,
      index,
      "O",
      [
        [2, 2, 2],
        [2, 3, 2],
        [2, 4, 2]
      ]
    );

    const decision = chooseBestBotMove({
      board,
      size,
      connect,
      winLinesIndex: createWinLinesIndex(size, connect),
      botMark: "O",
      timeBudgetMs: 1,
      maxDepth: 7
    });

    expect(decision.index).toBeGreaterThanOrEqual(0);
    expect(decision.index).toBeLessThan(board.length);
    expect(board[decision.index]).toBe(0);
  });
});
