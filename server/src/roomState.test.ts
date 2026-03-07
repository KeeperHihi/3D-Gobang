import { describe, expect, it, vi } from "vitest";
import { DEFAULT_BOARD_SIZE } from "../../shared/game/board";
import {
  applyMoveToRoom,
  applyDisconnectForfeitIfExpired,
  applyTurnForfeitIfExpired,
  cancelRematch,
  clearReconnectDeadline,
  createRoomState,
  getRecordedMoveAck,
  recordMoveAck,
  requestRematch,
  snapshotFromRoomState,
  setPlayerConnection,
  startReconnectDeadline
} from "./roomState";

function createFixtureRoom() {
  return createRoomState({
    roomId: "room-1",
    playerXSocketId: "socket-x",
    playerOSocketId: "socket-o",
    playerXSeatToken: "seat-x",
    playerOSeatToken: "seat-o"
  });
}

describe("requestRematch", () => {
  it("uses 8x8x8 board by default", () => {
    const room = createFixtureRoom();

    expect(room.size).toBe(DEFAULT_BOARD_SIZE);
    expect(room.board).toHaveLength(DEFAULT_BOARD_SIZE ** 3);
  });

  it("stores and reuses client move ack by seat", () => {
    const room = createFixtureRoom();
    const ack = {
      accepted: true,
      roomMoveNumber: 5
    };
    recordMoveAck(room, "X", "move-x-1", ack);

    expect(getRecordedMoveAck(room, "X", "move-x-1")).toEqual(ack);
    expect(getRecordedMoveAck(room, "O", "move-x-1")).toBeNull();
  });

  it("rejects rematch while game is still running", () => {
    const room = createFixtureRoom();
    const result = requestRematch(room, "X");

    expect(result).toEqual({
      accepted: false,
      started: false,
      reason: "对局尚未结束，无法再来一局"
    });
  });

  it("starts a new game only after both players vote post-game", () => {
    const room = createFixtureRoom();
    room.board[0] = 1;
    room.moveCount = 11;
    room.winner = "X";
    recordMoveAck(room, "X", "move-x-1", { accepted: true, roomMoveNumber: 11 });

    const firstVote = requestRematch(room, "X");
    expect(firstVote).toEqual({
      accepted: true,
      started: false
    });
    expect(room.board[0]).toBe(1);
    expect(room.winner).toBe("X");
    expect(snapshotFromRoomState(room).rematchReady).toEqual({
      X: true,
      O: false
    });

    const secondVote = requestRematch(room, "O");
    expect(secondVote).toEqual({
      accepted: true,
      started: true
    });
    expect(room.board.every((cell) => cell === 0)).toBe(true);
    expect(room.turn).toBe("X");
    expect(room.winner).toBeNull();
    expect(room.turnDeadlineAt).not.toBeNull();
    expect(room.moveCount).toBe(0);
    expect(getRecordedMoveAck(room, "X", "move-x-1")).toBeNull();
    expect(snapshotFromRoomState(room).rematchReady).toEqual({
      X: false,
      O: false
    });
  });

  it("rejects rematch when any player is disconnected", () => {
    const room = createFixtureRoom();
    room.winner = "X";
    setPlayerConnection(room, "O", null, false);

    const result = requestRematch(room, "X");

    expect(result).toEqual({
      accepted: false,
      started: false,
      reason: "有玩家离线，无法再来一局"
    });
    expect(snapshotFromRoomState(room).rematchReady).toEqual({
      X: false,
      O: false
    });
  });

  it("allows canceling a rematch vote before new game starts", () => {
    const room = createFixtureRoom();
    room.winner = "X";
    requestRematch(room, "X");

    const cancelResult = cancelRematch(room, "X");

    expect(cancelResult).toEqual({
      accepted: true,
      canceled: true
    });
    expect(snapshotFromRoomState(room).rematchReady).toEqual({
      X: false,
      O: false
    });
  });

  it("treats missing rematch vote cancel as idempotent success", () => {
    const room = createFixtureRoom();
    room.winner = "X";

    const cancelResult = cancelRematch(room, "X");

    expect(cancelResult).toEqual({
      accepted: true,
      canceled: false
    });
  });

  it("rejects cancel once new round has already started", () => {
    const room = createFixtureRoom();
    room.winner = "X";
    requestRematch(room, "X");
    requestRematch(room, "O");

    const cancelResult = cancelRematch(room, "X");

    expect(cancelResult).toEqual({
      accepted: false,
      canceled: false,
      reason: "对局尚未结束，无法取消再来一局"
    });
  });
});

describe("reconnect deadline and disconnect forfeit", () => {
  it("starts reconnect deadline when a seat disconnects", () => {
    const room = createFixtureRoom();
    setPlayerConnection(room, "O", null, false);

    const deadlineAt = startReconnectDeadline(room, "O", 10_000, 30_000);

    expect(deadlineAt).toBe(40_000);
    expect(room.players.O.reconnectDeadlineAt).toBe(40_000);
  });

  it("clears reconnect deadline after successful reconnect", () => {
    const room = createFixtureRoom();
    setPlayerConnection(room, "O", null, false);
    startReconnectDeadline(room, "O", 10_000, 30_000);

    setPlayerConnection(room, "O", "socket-o-new", true);
    clearReconnectDeadline(room, "O");

    expect(room.players.O.reconnectDeadlineAt).toBeNull();
  });

  it("forfeits disconnected player when deadline is expired", () => {
    const room = createFixtureRoom();
    room.rematchVotes.add("X");
    setPlayerConnection(room, "O", null, false);
    startReconnectDeadline(room, "O", 10_000, 30_000);

    const forfeited = applyDisconnectForfeitIfExpired(room, "O", 40_001);

    expect(forfeited).toBe(true);
    expect(room.winner).toBe("X");
    expect(room.winningLine).toBeNull();
    expect(room.players.O.reconnectDeadlineAt).toBeNull();
    expect(room.players.X.reconnectDeadlineAt).toBeNull();
    expect(room.turnDeadlineAt).toBeNull();
    expect(room.rematchVotes.size).toBe(0);
  });
});

describe("turn deadline and timeout forfeit", () => {
  it("initializes turn deadline when room is created", () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const room = createFixtureRoom();

    expect(room.turn).toBe("X");
    expect(room.turnDeadlineAt).toBe(301_000);
    nowSpy.mockRestore();
  });

  it("refreshes turn deadline after a valid move", () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(1_000);
    const room = createFixtureRoom();

    nowSpy.mockReturnValue(8_000);
    const result = applyMoveToRoom(room, "X", { x: 0, y: 0, z: 0 });

    expect(result.accepted).toBe(true);
    expect(room.turn).toBe("O");
    expect(room.turnDeadlineAt).toBe(308_000);
    nowSpy.mockRestore();
  });

  it("forfeits active turn only when matching deadline is expired", () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(2_000);
    const room = createFixtureRoom();
    const deadlineAt = room.turnDeadlineAt;
    expect(deadlineAt).not.toBeNull();

    const mismatchedDeadlineResult = applyTurnForfeitIfExpired(room, 99_999, (deadlineAt ?? 0) + 1);
    const earlyResult = applyTurnForfeitIfExpired(room, (deadlineAt ?? 0) - 1, deadlineAt ?? 0);
    const expiredResult = applyTurnForfeitIfExpired(room, deadlineAt ?? 0, deadlineAt ?? 0);

    expect(mismatchedDeadlineResult).toBe(false);
    expect(earlyResult).toBe(false);
    expect(expiredResult).toBe(true);
    expect(room.winner).toBe("O");
    expect(room.turnDeadlineAt).toBeNull();
    nowSpy.mockRestore();
  });

  it("rejects late move and applies timeout forfeit immediately", () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(1_000);
    const room = createFixtureRoom();
    const originalBoard = [...room.board];

    nowSpy.mockReturnValue(301_001);
    const result = applyMoveToRoom(room, "X", { x: 0, y: 0, z: 0 });

    expect(result).toEqual({
      accepted: false,
      timedOut: true,
      reason: "当前回合已超时，系统已判负"
    });
    expect(room.winner).toBe("O");
    expect(room.turnDeadlineAt).toBeNull();
    expect(room.board).toEqual(originalBoard);
    nowSpy.mockRestore();
  });
});
