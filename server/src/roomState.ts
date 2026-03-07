import {
  DEFAULT_BOARD_SIZE,
  DEFAULT_CONNECT_COUNT,
  boardIsFull,
  createBoard,
  toLinearIndex,
  writeCell,
  type BoardCell
} from "../../shared/game/board";
import { checkWinFromLastMove } from "../../shared/game/checkWin";
import { createWinLinesIndex, type WinLinesIndex } from "../../shared/game/winLines";
import type {
  Coordinate3D,
  MoveRecord,
  PlayerMark,
  RoomSnapshot,
  Winner
} from "../../shared/network/protocol";

interface PlayerSeatState {
  seatToken: string;
  socketId: string | null;
  connected: boolean;
  reconnectDeadlineAt: number | null;
}

export interface RecordedMoveAck {
  accepted: boolean;
  reason?: string;
  roomMoveNumber?: number;
}

const CLIENT_MOVE_ACK_HISTORY_LIMIT = 80;
const DEFAULT_TURN_LIMIT_MS = 300_000;

export interface RoomState {
  roomId: string;
  size: number;
  connect: number;
  board: BoardCell[];
  turn: PlayerMark;
  turnDeadlineAt: number | null;
  winner: Winner;
  lastMove: MoveRecord | null;
  winningLine: number[] | null;
  players: {
    X: PlayerSeatState;
    O: PlayerSeatState;
  };
  clientMoveAcks: {
    X: Map<string, RecordedMoveAck>;
    O: Map<string, RecordedMoveAck>;
  };
  clientMoveAckOrder: {
    X: string[];
    O: string[];
  };
  rematchVotes: Set<PlayerMark>;
  winLinesIndex: WinLinesIndex;
  moveCount: number;
}

interface RoomCreateOptions {
  roomId: string;
  playerXSocketId: string;
  playerOSocketId: string;
  playerXSeatToken: string;
  playerOSeatToken: string;
  size?: number;
  connect?: number;
}

export interface MoveApplyResult {
  accepted: boolean;
  reason?: string;
  timedOut?: boolean;
}

export interface RematchRequestResult {
  accepted: boolean;
  started: boolean;
  reason?: string;
}

export interface RematchCancelResult {
  accepted: boolean;
  canceled: boolean;
  reason?: string;
}

export function createRoomState(options: RoomCreateOptions): RoomState {
  const size = options.size ?? DEFAULT_BOARD_SIZE;
  const connect = options.connect ?? DEFAULT_CONNECT_COUNT;
  const room: RoomState = {
    roomId: options.roomId,
    size,
    connect,
    board: createBoard(size),
    turn: "X",
    turnDeadlineAt: null,
    winner: null,
    lastMove: null,
    winningLine: null,
    players: {
      X: {
        seatToken: options.playerXSeatToken,
        socketId: options.playerXSocketId,
        connected: true,
        reconnectDeadlineAt: null
      },
      O: {
        seatToken: options.playerOSeatToken,
        socketId: options.playerOSocketId,
        connected: true,
        reconnectDeadlineAt: null
      }
    },
    clientMoveAcks: {
      X: new Map<string, RecordedMoveAck>(),
      O: new Map<string, RecordedMoveAck>()
    },
    clientMoveAckOrder: {
      X: [],
      O: []
    },
    rematchVotes: new Set<PlayerMark>(),
    winLinesIndex: createWinLinesIndex(size, connect),
    moveCount: 0
  };

  startTurnDeadline(room, Date.now());
  return room;
}

export function getRecordedMoveAck(
  room: RoomState,
  mark: PlayerMark,
  clientMoveId: string
): RecordedMoveAck | null {
  return room.clientMoveAcks[mark].get(clientMoveId) ?? null;
}

export function recordMoveAck(
  room: RoomState,
  mark: PlayerMark,
  clientMoveId: string,
  ack: RecordedMoveAck
): void {
  const ackMap = room.clientMoveAcks[mark];
  const ackOrder = room.clientMoveAckOrder[mark];

  if (ackMap.has(clientMoveId)) {
    return;
  }

  ackMap.set(clientMoveId, ack);
  ackOrder.push(clientMoveId);
  if (ackOrder.length <= CLIENT_MOVE_ACK_HISTORY_LIMIT) {
    return;
  }

  const removedMoveId = ackOrder.shift();
  if (!removedMoveId) {
    return;
  }
  ackMap.delete(removedMoveId);
}

function clearRecordedMoveAcks(room: RoomState): void {
  room.clientMoveAcks.X.clear();
  room.clientMoveAcks.O.clear();
  room.clientMoveAckOrder.X = [];
  room.clientMoveAckOrder.O = [];
}

function clearReconnectDeadlines(room: RoomState): void {
  room.players.X.reconnectDeadlineAt = null;
  room.players.O.reconnectDeadlineAt = null;
}

function currentTurnTimeLimitMs(): number {
  return DEFAULT_TURN_LIMIT_MS;
}

export function startTurnDeadline(room: RoomState, nowMs: number): number | null {
  if (room.winner) {
    room.turnDeadlineAt = null;
    return null;
  }

  const deadlineAt = nowMs + currentTurnTimeLimitMs();
  room.turnDeadlineAt = deadlineAt;
  return deadlineAt;
}

export function clearTurnDeadline(room: RoomState): void {
  room.turnDeadlineAt = null;
}

export function applyTurnForfeitIfExpired(
  room: RoomState,
  nowMs: number,
  expectedDeadlineAt?: number
): boolean {
  if (room.winner || room.turnDeadlineAt === null) {
    return false;
  }

  if (expectedDeadlineAt !== undefined && room.turnDeadlineAt !== expectedDeadlineAt) {
    return false;
  }

  if (room.turnDeadlineAt > nowMs) {
    return false;
  }

  room.winner = room.turn === "X" ? "O" : "X";
  room.winningLine = null;
  room.rematchVotes.clear();
  clearReconnectDeadlines(room);
  clearTurnDeadline(room);
  return true;
}

export function snapshotFromRoomState(room: RoomState): RoomSnapshot {
  return {
    roomId: room.roomId,
    size: room.size,
    connect: room.connect,
    board: room.board,
    turn: room.turn,
    turnDeadlineAt: room.turnDeadlineAt,
    winner: room.winner,
    lastMove: room.lastMove,
    winningLine: room.winningLine,
    players: {
      X: {
        connected: room.players.X.connected,
        reconnectDeadlineAt: room.players.X.reconnectDeadlineAt
      },
      O: {
        connected: room.players.O.connected,
        reconnectDeadlineAt: room.players.O.reconnectDeadlineAt
      }
    },
    rematchReady: {
      X: room.rematchVotes.has("X"),
      O: room.rematchVotes.has("O")
    }
  };
}

export function markForSeatToken(room: RoomState, seatToken: string): PlayerMark | null {
  if (room.players.X.seatToken === seatToken) {
    return "X";
  }
  if (room.players.O.seatToken === seatToken) {
    return "O";
  }
  return null;
}

export function setPlayerConnection(
  room: RoomState,
  mark: PlayerMark,
  socketId: string | null,
  connected: boolean
): void {
  room.players[mark].socketId = socketId;
  room.players[mark].connected = connected;
  if (connected) {
    room.players[mark].reconnectDeadlineAt = null;
  }
}

export function startReconnectDeadline(
  room: RoomState,
  mark: PlayerMark,
  nowMs: number,
  timeoutMs: number
): number | null {
  if (room.winner || room.players[mark].connected) {
    return null;
  }

  const deadlineAt = nowMs + timeoutMs;
  room.players[mark].reconnectDeadlineAt = deadlineAt;
  return deadlineAt;
}

export function clearReconnectDeadline(room: RoomState, mark: PlayerMark): void {
  room.players[mark].reconnectDeadlineAt = null;
}

export function applyDisconnectForfeitIfExpired(
  room: RoomState,
  disconnectedMark: PlayerMark,
  nowMs: number
): boolean {
  if (room.winner) {
    return false;
  }

  const disconnectedSeat = room.players[disconnectedMark];
  const deadlineAt = disconnectedSeat.reconnectDeadlineAt;
  if (disconnectedSeat.connected || deadlineAt === null || deadlineAt > nowMs) {
    return false;
  }

  room.winner = disconnectedMark === "X" ? "O" : "X";
  room.winningLine = null;
  room.rematchVotes.clear();
  clearReconnectDeadlines(room);
  clearTurnDeadline(room);
  return true;
}

export function markForSocket(room: RoomState, socketId: string): PlayerMark | null {
  if (room.players.X.socketId === socketId) {
    return "X";
  }
  if (room.players.O.socketId === socketId) {
    return "O";
  }
  return null;
}

export function applyMoveToRoom(
  room: RoomState,
  mark: PlayerMark,
  coordinate: Coordinate3D
): MoveApplyResult {
  if (applyTurnForfeitIfExpired(room, Date.now())) {
    return {
      accepted: false,
      timedOut: true,
      reason: "当前回合已超时，系统已判负"
    };
  }

  if (room.winner) {
    return {
      accepted: false,
      reason: "对局已结束，请点击再来一局"
    };
  }

  if (room.turn !== mark) {
    return {
      accepted: false,
      reason: "当前不是你的回合"
    };
  }

  const placed = writeCell(room.board, coordinate, mark, room.size);
  if (!placed) {
    return {
      accepted: false,
      reason: "该位置不可落子"
    };
  }

  room.moveCount += 1;
  room.rematchVotes.clear();
  room.lastMove = {
    x: coordinate.x,
    y: coordinate.y,
    z: coordinate.z,
    player: mark,
    moveNumber: room.moveCount,
    timestamp: Date.now()
  };

  const lastMoveIndex = toLinearIndex(coordinate, room.size);
  const winResult = checkWinFromLastMove(room.board, room.winLinesIndex, lastMoveIndex, mark);
  if (winResult.winner) {
    room.winner = winResult.winner;
    room.winningLine = winResult.winningLine;
    clearReconnectDeadlines(room);
    clearTurnDeadline(room);
    return { accepted: true };
  }

  if (boardIsFull(room.board)) {
    room.winner = "draw";
    room.winningLine = null;
    clearReconnectDeadlines(room);
    clearTurnDeadline(room);
    return { accepted: true };
  }

  room.turn = room.turn === "X" ? "O" : "X";
  startTurnDeadline(room, Date.now());
  return { accepted: true };
}

export function requestRematch(room: RoomState, mark: PlayerMark): RematchRequestResult {
  if (!room.winner) {
    return {
      accepted: false,
      started: false,
      reason: "对局尚未结束，无法再来一局"
    };
  }

  if (!room.players.X.connected || !room.players.O.connected) {
    return {
      accepted: false,
      started: false,
      reason: "有玩家离线，无法再来一局"
    };
  }

  room.rematchVotes.add(mark);
  if (room.rematchVotes.size < 2) {
    return {
      accepted: true,
      started: false
    };
  }

  room.board = createBoard(room.size);
  room.turn = "X";
  room.winner = null;
  room.lastMove = null;
  room.winningLine = null;
  room.moveCount = 0;
  room.rematchVotes.clear();
  clearReconnectDeadlines(room);
  clearRecordedMoveAcks(room);
  startTurnDeadline(room, Date.now());

  return {
    accepted: true,
    started: true
  };
}

export function cancelRematch(room: RoomState, mark: PlayerMark): RematchCancelResult {
  if (!room.winner) {
    return {
      accepted: false,
      canceled: false,
      reason: "对局尚未结束，无法取消再来一局"
    };
  }

  const canceled = room.rematchVotes.delete(mark);
  return {
    accepted: true,
    canceled
  };
}
