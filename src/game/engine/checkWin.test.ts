import { describe, expect, it } from "vitest";
import type { Coordinate3D } from "../../../shared/network/protocol";
import { createBoard, toLinearIndex, writeCell } from "./board";
import { checkWinFromLastMove } from "./checkWin";
import { DIRECTION_VECTORS_3D, createWinLinesIndex } from "./winLines";

const size = 5;
const connect = 5;
const winLinesIndex = createWinLinesIndex(size, connect);

function startForDirection(direction: Coordinate3D): Coordinate3D {
  return {
    x: direction.x === -1 ? size - 1 : 0,
    y: direction.y === -1 ? size - 1 : 0,
    z: direction.z === -1 ? size - 1 : 0
  };
}

describe("checkWinFromLastMove", () => {
  it.each(DIRECTION_VECTORS_3D.map((direction, index) => [index, direction] as const))(
    "detects win for direction #%i",
    (_, direction) => {
      const board = createBoard(size);
      const start = startForDirection(direction);

      for (let step = 0; step < connect; step += 1) {
        const coordinate = {
          x: start.x + direction.x * step,
          y: start.y + direction.y * step,
          z: start.z + direction.z * step
        };
        const placed = writeCell(board, coordinate, "X", size);
        expect(placed).toBe(true);
      }

      const lastMove = {
        x: start.x + direction.x * (connect - 1),
        y: start.y + direction.y * (connect - 1),
        z: start.z + direction.z * (connect - 1)
      };
      const result = checkWinFromLastMove(
        board,
        winLinesIndex,
        toLinearIndex(lastMove, size),
        "X"
      );

      expect(result.winner).toBe("X");
      expect(result.winningLine?.length).toBe(connect);
    }
  );

  it("returns null winner when no line has five stones", () => {
    const board = createBoard(size);
    writeCell(board, { x: 0, y: 0, z: 0 }, "O", size);
    writeCell(board, { x: 1, y: 0, z: 0 }, "O", size);
    writeCell(board, { x: 2, y: 0, z: 0 }, "O", size);
    writeCell(board, { x: 3, y: 0, z: 0 }, "O", size);

    const result = checkWinFromLastMove(board, winLinesIndex, toLinearIndex({ x: 3, y: 0, z: 0 }, size), "O");
    expect(result.winner).toBeNull();
    expect(result.winningLine).toBeNull();
  });
});
