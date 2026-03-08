import {
  PLAYER_TO_BOARD_VALUE,
  fromLinearIndex,
  type BoardCell
} from "../../../shared/game/board";
import type { WinLinesIndex } from "../../../shared/game/winLines";
import type { PlayerMark } from "../../../shared/network/protocol";

const LINE_WEIGHT = [0, 3, 18, 130, 1_600, 2_000_000];
const OPPONENT_PRESSURE_MULTIPLIER = 1.08;

export function opponentOf(mark: PlayerMark): PlayerMark {
  return mark === "X" ? "O" : "X";
}

export function canWinAtIndex(
  board: BoardCell[],
  winLinesIndex: WinLinesIndex,
  mark: PlayerMark,
  index: number
): boolean {
  if (board[index] !== 0) {
    return false;
  }
  const expectedValue = PLAYER_TO_BOARD_VALUE[mark];
  for (const lineIndex of winLinesIndex.cellToLines[index]) {
    const line = winLinesIndex.lines[lineIndex];
    let isWinningLine = true;
    for (const cellIndex of line) {
      if (cellIndex === index) {
        continue;
      }
      if (board[cellIndex] !== expectedValue) {
        isWinningLine = false;
        break;
      }
    }
    if (isWinningLine) {
      return true;
    }
  }
  return false;
}

export function findImmediateWinningIndices(
  board: BoardCell[],
  winLinesIndex: WinLinesIndex,
  mark: PlayerMark
): number[] {
  const winningIndices: number[] = [];
  for (let index = 0; index < board.length; index += 1) {
    if (board[index] !== 0) {
      continue;
    }
    if (canWinAtIndex(board, winLinesIndex, mark, index)) {
      winningIndices.push(index);
    }
  }
  return winningIndices;
}

function scoreByCenter(index: number, size: number): number {
  const coordinate = fromLinearIndex(index, size);
  const center = (size - 1) / 2;
  const distance =
    Math.abs(coordinate.x - center) +
    Math.abs(coordinate.y - center) +
    Math.abs(coordinate.z - center);
  return Math.max(0, size * 3 - distance) * 0.9;
}

export function scoreMoveHeuristic(
  board: BoardCell[],
  winLinesIndex: WinLinesIndex,
  mark: PlayerMark,
  index: number
): number {
  if (board[index] !== 0) {
    return Number.NEGATIVE_INFINITY;
  }

  const opponent = opponentOf(mark);
  if (canWinAtIndex(board, winLinesIndex, mark, index)) {
    return 90_000_000;
  }
  if (canWinAtIndex(board, winLinesIndex, opponent, index)) {
    return 80_000_000;
  }

  const markValue = PLAYER_TO_BOARD_VALUE[mark];
  const opponentValue = PLAYER_TO_BOARD_VALUE[opponent];
  let offensiveScore = 0;
  let defensiveScore = 0;

  for (const lineIndex of winLinesIndex.cellToLines[index]) {
    const line = winLinesIndex.lines[lineIndex];
    let ownCount = 0;
    let opponentCount = 0;

    for (const cellIndex of line) {
      if (cellIndex === index) {
        continue;
      }
      const value = board[cellIndex];
      if (value === markValue) {
        ownCount += 1;
      } else if (value === opponentValue) {
        opponentCount += 1;
      }
    }

    if (opponentCount === 0) {
      offensiveScore += LINE_WEIGHT[ownCount + 1];
      if (ownCount === 3) {
        offensiveScore += 300;
      }
    }
    if (ownCount === 0) {
      defensiveScore += LINE_WEIGHT[opponentCount + 1] * 0.95;
      if (opponentCount === 3) {
        defensiveScore += 380;
      }
    }
  }

  return offensiveScore + defensiveScore + scoreByCenter(index, winLinesIndex.size);
}

export function evaluateBoard(
  board: BoardCell[],
  winLinesIndex: WinLinesIndex,
  perspective: PlayerMark
): number {
  const perspectiveValue = PLAYER_TO_BOARD_VALUE[perspective];
  const opponentValue = PLAYER_TO_BOARD_VALUE[opponentOf(perspective)];
  let score = 0;

  for (const line of winLinesIndex.lines) {
    let perspectiveCount = 0;
    let opponentCount = 0;
    for (const index of line) {
      const value = board[index];
      if (value === perspectiveValue) {
        perspectiveCount += 1;
      } else if (value === opponentValue) {
        opponentCount += 1;
      }
    }

    if (perspectiveCount > 0 && opponentCount > 0) {
      continue;
    }
    if (perspectiveCount > 0) {
      score += LINE_WEIGHT[perspectiveCount];
      if (perspectiveCount === 4) {
        score += 7_500;
      }
      continue;
    }
    if (opponentCount > 0) {
      score -= Math.round(LINE_WEIGHT[opponentCount] * OPPONENT_PRESSURE_MULTIPLIER);
      if (opponentCount === 4) {
        score -= 9_500;
      }
    }
  }

  for (let index = 0; index < board.length; index += 1) {
    if (board[index] === perspectiveValue) {
      score += scoreByCenter(index, winLinesIndex.size);
      continue;
    }
    if (board[index] === opponentValue) {
      score -= scoreByCenter(index, winLinesIndex.size) * 0.92;
    }
  }

  return score;
}
