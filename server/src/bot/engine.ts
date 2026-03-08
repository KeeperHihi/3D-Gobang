import {
  PLAYER_TO_BOARD_VALUE,
  fromLinearIndex,
  type BoardCell
} from "../../../shared/game/board";
import { checkWinFromLastMove } from "../../../shared/game/checkWin";
import type { WinLinesIndex } from "../../../shared/game/winLines";
import type { Coordinate3D, PlayerMark } from "../../../shared/network/protocol";
import { rankCandidateMoves } from "./candidate";
import {
  evaluateBoard,
  findImmediateWinningIndices,
  opponentOf,
  scoreMoveHeuristic
} from "./evaluator";

const DEFAULT_TIME_BUDGET_MS = 120;
const DEFAULT_MAX_DEPTH = 6;
const ROOT_MAX_CANDIDATES = 14;
const INNER_MAX_CANDIDATES = 8;
const WIN_SCORE = 80_000_000;

class SearchTimeoutError extends Error {
  constructor() {
    super("BOT_SEARCH_TIMEOUT");
  }
}

interface ChooseBotMoveOptions {
  board: BoardCell[];
  size: number;
  connect: number;
  winLinesIndex: WinLinesIndex;
  botMark: PlayerMark;
  timeBudgetMs?: number;
  maxDepth?: number;
}

export interface BotMoveDecision {
  coordinate: Coordinate3D;
  index: number;
  searchedDepth: number;
  timedOut: boolean;
}

interface MinimaxContext {
  board: BoardCell[];
  winLinesIndex: WinLinesIndex;
  botMark: PlayerMark;
  startMs: number;
  timeBudgetMs: number;
}

interface MinimaxInput {
  currentMark: PlayerMark;
  depth: number;
  alpha: number;
  beta: number;
  emptyCount: number;
  lastMoveIndex: number | null;
  lastMoveMark: PlayerMark | null;
}

function assertWithinBudget(startMs: number, budgetMs: number): void {
  if (Date.now() - startMs >= budgetMs) {
    throw new SearchTimeoutError();
  }
}

function fallbackEmptyIndex(board: BoardCell[]): number {
  for (let index = 0; index < board.length; index += 1) {
    if (board[index] === 0) {
      return index;
    }
  }
  return 0;
}

function minimax(context: MinimaxContext, input: MinimaxInput): number {
  assertWithinBudget(context.startMs, context.timeBudgetMs);

  const { board, winLinesIndex, botMark } = context;
  const {
    currentMark,
    depth,
    alpha: alphaInput,
    beta: betaInput,
    emptyCount,
    lastMoveIndex,
    lastMoveMark
  } = input;

  if (lastMoveIndex !== null && lastMoveMark !== null) {
    const winResult = checkWinFromLastMove(board, winLinesIndex, lastMoveIndex, lastMoveMark);
    if (winResult.winner === botMark) {
      return WIN_SCORE + depth * 100;
    }
    if (winResult.winner === opponentOf(botMark)) {
      return -WIN_SCORE - depth * 100;
    }
  }

  if (emptyCount <= 0) {
    return 0;
  }

  if (depth <= 0) {
    return evaluateBoard(board, winLinesIndex, botMark);
  }

  const candidates = rankCandidateMoves({
    board,
    winLinesIndex,
    currentMark,
    maxCandidates: depth >= 4 ? INNER_MAX_CANDIDATES : INNER_MAX_CANDIDATES + 2
  });
  if (candidates.length === 0) {
    return evaluateBoard(board, winLinesIndex, botMark);
  }

  const currentValue = PLAYER_TO_BOARD_VALUE[currentMark];
  const nextMark = opponentOf(currentMark);
  const isMaximizing = currentMark === botMark;
  let alpha = alphaInput;
  let beta = betaInput;

  if (isMaximizing) {
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const index of candidates) {
      assertWithinBudget(context.startMs, context.timeBudgetMs);
      board[index] = currentValue;
      let childScore: number;
      try {
        childScore = minimax(context, {
          currentMark: nextMark,
          depth: depth - 1,
          alpha,
          beta,
          emptyCount: emptyCount - 1,
          lastMoveIndex: index,
          lastMoveMark: currentMark
        });
      } finally {
        board[index] = 0;
      }
      if (childScore > bestScore) {
        bestScore = childScore;
      }
      if (bestScore > alpha) {
        alpha = bestScore;
      }
      if (alpha >= beta) {
        break;
      }
    }
    return bestScore;
  }

  let bestScore = Number.POSITIVE_INFINITY;
  for (const index of candidates) {
    assertWithinBudget(context.startMs, context.timeBudgetMs);
    board[index] = currentValue;
    let childScore: number;
    try {
      childScore = minimax(context, {
        currentMark: nextMark,
        depth: depth - 1,
        alpha,
        beta,
        emptyCount: emptyCount - 1,
        lastMoveIndex: index,
        lastMoveMark: currentMark
      });
    } finally {
      board[index] = 0;
    }
    if (childScore < bestScore) {
      bestScore = childScore;
    }
    if (bestScore < beta) {
      beta = bestScore;
    }
    if (alpha >= beta) {
      break;
    }
  }
  return bestScore;
}

function countEmptyCells(board: BoardCell[]): number {
  let emptyCount = 0;
  for (const cell of board) {
    if (cell === 0) {
      emptyCount += 1;
    }
  }
  return emptyCount;
}

export function chooseBestBotMove(options: ChooseBotMoveOptions): BotMoveDecision {
  const {
    board,
    size,
    winLinesIndex,
    botMark,
    timeBudgetMs = DEFAULT_TIME_BUDGET_MS,
    maxDepth = DEFAULT_MAX_DEPTH
  } = options;

  const opponent = opponentOf(botMark);
  const immediateWins = findImmediateWinningIndices(board, winLinesIndex, botMark);
  if (immediateWins.length > 0) {
    immediateWins.sort((left, right) => {
      const scoreDiff =
        scoreMoveHeuristic(board, winLinesIndex, botMark, right) -
        scoreMoveHeuristic(board, winLinesIndex, botMark, left);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      return left - right;
    });
    const index = immediateWins[0] ?? fallbackEmptyIndex(board);
    return {
      coordinate: fromLinearIndex(index, size),
      index,
      searchedDepth: 1,
      timedOut: false
    };
  }

  const forcedBlocks = findImmediateWinningIndices(board, winLinesIndex, opponent);
  if (forcedBlocks.length > 0) {
    forcedBlocks.sort((left, right) => {
      const scoreDiff =
        scoreMoveHeuristic(board, winLinesIndex, botMark, right) -
        scoreMoveHeuristic(board, winLinesIndex, botMark, left);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      return left - right;
    });
    const index = forcedBlocks[0] ?? fallbackEmptyIndex(board);
    return {
      coordinate: fromLinearIndex(index, size),
      index,
      searchedDepth: 1,
      timedOut: false
    };
  }

  const rootCandidates = rankCandidateMoves({
    board,
    winLinesIndex,
    currentMark: botMark,
    maxCandidates: ROOT_MAX_CANDIDATES
  });
  if (rootCandidates.length === 0) {
    const index = fallbackEmptyIndex(board);
    return {
      coordinate: fromLinearIndex(index, size),
      index,
      searchedDepth: 0,
      timedOut: false
    };
  }

  const startMs = Date.now();
  const budgetMs = Math.max(20, timeBudgetMs);
  const searchDepth = Math.max(2, maxDepth);
  const botValue = PLAYER_TO_BOARD_VALUE[botMark];
  const emptyCount = countEmptyCells(board);
  const context: MinimaxContext = {
    board,
    winLinesIndex,
    botMark,
    startMs,
    timeBudgetMs: budgetMs
  };

  let bestIndex = rootCandidates[0] ?? fallbackEmptyIndex(board);
  let completedDepth = 0;
  let timedOut = false;

  for (let depth = 2; depth <= searchDepth; depth += 1) {
    const depthScores = new Map<number, number>();
    let depthBestScore = Number.NEGATIVE_INFINITY;
    let depthBestIndex = bestIndex;

    try {
      for (const index of rootCandidates) {
        assertWithinBudget(startMs, budgetMs);
        board[index] = botValue;
        let score: number;
        try {
          score = minimax(context, {
            currentMark: opponent,
            depth: depth - 1,
            alpha: Number.NEGATIVE_INFINITY,
            beta: Number.POSITIVE_INFINITY,
            emptyCount: emptyCount - 1,
            lastMoveIndex: index,
            lastMoveMark: botMark
          });
        } finally {
          board[index] = 0;
        }
        depthScores.set(index, score);
        if (score > depthBestScore || (score === depthBestScore && index < depthBestIndex)) {
          depthBestScore = score;
          depthBestIndex = index;
        }
      }
      rootCandidates.sort((left, right) => {
        const leftScore = depthScores.get(left) ?? Number.NEGATIVE_INFINITY;
        const rightScore = depthScores.get(right) ?? Number.NEGATIVE_INFINITY;
        if (rightScore !== leftScore) {
          return rightScore - leftScore;
        }
        return left - right;
      });
      bestIndex = depthBestIndex;
      completedDepth = depth;
    } catch (error) {
      if (!(error instanceof SearchTimeoutError)) {
        throw error;
      }
      timedOut = true;
      break;
    }
  }

  return {
    coordinate: fromLinearIndex(bestIndex, size),
    index: bestIndex,
    searchedDepth: completedDepth,
    timedOut
  };
}
