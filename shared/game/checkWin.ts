import type { PlayerMark } from "../network/protocol";
import { PLAYER_TO_BOARD_VALUE, type BoardCell } from "./board";
import type { WinLinesIndex } from "./winLines";

export interface WinCheckResult {
  winner: PlayerMark | null;
  winningLine: number[] | null;
}

export function checkWinFromLastMove(
  board: BoardCell[],
  winLinesIndex: WinLinesIndex,
  lastMoveIndex: number,
  player: PlayerMark
): WinCheckResult {
  const expectedValue = PLAYER_TO_BOARD_VALUE[player];
  for (const lineIndex of winLinesIndex.cellToLines[lastMoveIndex]) {
    const line = winLinesIndex.lines[lineIndex];
    const lineCompleted = line.every((cellIndex) => board[cellIndex] === expectedValue);
    if (lineCompleted) {
      return {
        winner: player,
        winningLine: line
      };
    }
  }
  return {
    winner: null,
    winningLine: null
  };
}
