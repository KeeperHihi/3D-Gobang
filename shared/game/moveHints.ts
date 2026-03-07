import type { Coordinate3D, PlayerMark } from "../network/protocol";
import {
  PLAYER_TO_BOARD_VALUE,
  fromLinearIndex,
  type BoardCell
} from "./board";
import { createWinLinesIndex, type WinLinesIndex } from "./winLines";

export type HintPriority = "win" | "block" | "best";

export interface MoveHint {
  index: number;
  coordinate: Coordinate3D;
  score: number;
  priority: HintPriority;
}

export interface MoveHintsResult {
  winningMoves: MoveHint[];
  blockingMoves: MoveHint[];
  recommendedMoves: MoveHint[];
}

interface RankedMove {
  index: number;
  score: number;
}

function opponentOf(mark: PlayerMark): PlayerMark {
  return mark === "X" ? "O" : "X";
}

function scoreByCenter(index: number, size: number): number {
  const coordinate = fromLinearIndex(index, size);
  const center = (size - 1) / 2;
  const distance =
    Math.abs(coordinate.x - center) +
    Math.abs(coordinate.y - center) +
    Math.abs(coordinate.z - center);
  return Math.max(0, size * 3 - distance) * 1.2;
}

function scoreLinePotential(
  board: BoardCell[],
  index: number,
  player: PlayerMark,
  winLinesIndex: WinLinesIndex
): number {
  const playerValue = PLAYER_TO_BOARD_VALUE[player];
  const opponentValue = PLAYER_TO_BOARD_VALUE[opponentOf(player)];

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
      if (value === playerValue) {
        ownCount += 1;
      }
      if (value === opponentValue) {
        opponentCount += 1;
      }
    }

    if (opponentCount === 0) {
      offensiveScore += Math.pow(ownCount + 1, 3);
    }
    if (ownCount === 0) {
      defensiveScore += Math.pow(opponentCount + 1, 2.6);
    }
  }

  return offensiveScore * 1.1 + defensiveScore;
}

function canWinOnMove(
  board: BoardCell[],
  index: number,
  mark: PlayerMark,
  winLinesIndex: WinLinesIndex
): boolean {
  if (board[index] !== 0) {
    return false;
  }

  const markValue = PLAYER_TO_BOARD_VALUE[mark];
  for (const lineIndex of winLinesIndex.cellToLines[index]) {
    const line = winLinesIndex.lines[lineIndex];
    let lineCompleted = true;

    for (const cellIndex of line) {
      if (cellIndex === index) {
        continue;
      }
      if (board[cellIndex] !== markValue) {
        lineCompleted = false;
        break;
      }
    }

    if (lineCompleted) {
      return true;
    }
  }

  return false;
}

function toHints(
  moves: RankedMove[],
  size: number,
  priority: HintPriority
): MoveHint[] {
  return moves.map((move) => ({
    index: move.index,
    coordinate: fromLinearIndex(move.index, size),
    score: move.score,
    priority
  }));
}

function rankMovesDescending(moves: RankedMove[]): RankedMove[] {
  return [...moves].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.index - right.index;
  });
}

export function analyzeMoveHints(
  board: BoardCell[],
  turn: PlayerMark,
  size: number,
  connect: number,
  maxRecommendations: number = 3,
  winLinesIndex?: WinLinesIndex
): MoveHintsResult {
  const safeMaxRecommendations = Math.max(1, maxRecommendations);
  const index = winLinesIndex ?? createWinLinesIndex(size, connect);
  const emptyIndices: number[] = [];
  for (let cellIndex = 0; cellIndex < board.length; cellIndex += 1) {
    if (board[cellIndex] === 0) {
      emptyIndices.push(cellIndex);
    }
  }

  if (emptyIndices.length === 0) {
    return {
      winningMoves: [],
      blockingMoves: [],
      recommendedMoves: []
    };
  }

  const winningMoves: RankedMove[] = [];
  const blockingMoves: RankedMove[] = [];
  const bestCandidateMoves: RankedMove[] = [];
  const opponent = opponentOf(turn);

  for (const cellIndex of emptyIndices) {
    const linePotentialScore = scoreLinePotential(board, cellIndex, turn, index);
    const centerScore = scoreByCenter(cellIndex, size);
    const totalScore = linePotentialScore + centerScore;

    if (canWinOnMove(board, cellIndex, turn, index)) {
      winningMoves.push({
        index: cellIndex,
        score: 1_000_000 + totalScore
      });
      continue;
    }

    if (canWinOnMove(board, cellIndex, opponent, index)) {
      blockingMoves.push({
        index: cellIndex,
        score: 900_000 + totalScore
      });
      continue;
    }

    bestCandidateMoves.push({
      index: cellIndex,
      score: totalScore
    });
  }

  const rankedWinningMoves = rankMovesDescending(winningMoves);
  const rankedBlockingMoves = rankMovesDescending(blockingMoves);
  const rankedBestMoves = rankMovesDescending(bestCandidateMoves);

  let recommendedPool: RankedMove[] = rankedBestMoves;
  let recommendationPriority: HintPriority = "best";
  if (rankedWinningMoves.length > 0) {
    recommendedPool = rankedWinningMoves;
    recommendationPriority = "win";
  } else if (rankedBlockingMoves.length > 0) {
    recommendedPool = rankedBlockingMoves;
    recommendationPriority = "block";
  }

  return {
    winningMoves: toHints(rankedWinningMoves, size, "win"),
    blockingMoves: toHints(rankedBlockingMoves, size, "block"),
    recommendedMoves: toHints(
      recommendedPool.slice(0, safeMaxRecommendations),
      size,
      recommendationPriority
    )
  };
}
