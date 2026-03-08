import {
  fromLinearIndex,
  toLinearIndex,
  type BoardCell
} from "../../../shared/game/board";
import type { WinLinesIndex } from "../../../shared/game/winLines";
import type { PlayerMark } from "../../../shared/network/protocol";
import {
  findImmediateWinningIndices,
  opponentOf,
  scoreMoveHeuristic
} from "./evaluator";

interface CandidateOptions {
  board: BoardCell[];
  winLinesIndex: WinLinesIndex;
  currentMark: PlayerMark;
  maxCandidates: number;
}

interface RankedCandidate {
  index: number;
  score: number;
}

function centerIndex(size: number): number {
  const center = Math.floor((size - 1) / 2);
  return toLinearIndex({ x: center, y: center, z: center }, size);
}

function collectFrontierIndices(board: BoardCell[], size: number): Set<number> {
  const candidates = new Set<number>();

  for (let index = 0; index < board.length; index += 1) {
    if (board[index] === 0) {
      continue;
    }
    const coordinate = fromLinearIndex(index, size);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          if (dx === 0 && dy === 0 && dz === 0) {
            continue;
          }
          const nextX = coordinate.x + dx;
          const nextY = coordinate.y + dy;
          const nextZ = coordinate.z + dz;
          if (nextX < 0 || nextY < 0 || nextZ < 0) {
            continue;
          }
          if (nextX >= size || nextY >= size || nextZ >= size) {
            continue;
          }
          const nextIndex = nextX + nextY * size + nextZ * size * size;
          if (board[nextIndex] === 0) {
            candidates.add(nextIndex);
          }
        }
      }
    }
  }

  return candidates;
}

function rankByScore(candidates: RankedCandidate[]): number[] {
  return candidates
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.index - right.index;
    })
    .map((candidate) => candidate.index);
}

export function rankCandidateMoves({
  board,
  winLinesIndex,
  currentMark,
  maxCandidates
}: CandidateOptions): number[] {
  if (maxCandidates <= 0) {
    return [];
  }

  const immediateWins = findImmediateWinningIndices(board, winLinesIndex, currentMark);
  if (immediateWins.length > 0) {
    return rankByScore(
      immediateWins.map((index) => ({
        index,
        score: scoreMoveHeuristic(board, winLinesIndex, currentMark, index)
      }))
    ).slice(0, maxCandidates);
  }

  const opponent = opponentOf(currentMark);
  const forcedBlocks = findImmediateWinningIndices(board, winLinesIndex, opponent);

  let occupiedCount = 0;
  for (const value of board) {
    if (value !== 0) {
      occupiedCount += 1;
    }
  }

  if (occupiedCount === 0) {
    return [centerIndex(winLinesIndex.size)];
  }

  const frontier = collectFrontierIndices(board, winLinesIndex.size);
  for (const forcedBlock of forcedBlocks) {
    frontier.add(forcedBlock);
  }

  if (frontier.size === 0) {
    const fallbackCenter = centerIndex(winLinesIndex.size);
    if (board[fallbackCenter] === 0) {
      return [fallbackCenter];
    }
    for (let index = 0; index < board.length; index += 1) {
      if (board[index] === 0) {
        return [index];
      }
    }
    return [];
  }

  const ranked: RankedCandidate[] = [];
  for (const index of frontier) {
    if (board[index] !== 0) {
      continue;
    }
    let score = scoreMoveHeuristic(board, winLinesIndex, currentMark, index);
    if (forcedBlocks.includes(index)) {
      score += 75_000_000;
    }
    ranked.push({
      index,
      score
    });
  }

  return rankByScore(ranked).slice(0, maxCandidates);
}
