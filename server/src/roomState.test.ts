import { describe, expect, it } from "vitest";
import {
  applyDisconnectForfeitIfExpired,
  clearReconnectDeadline,
  createRoomState,
  getRecordedMoveAck,
  recordMoveAck,
  requestRematch,
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

    const secondVote = requestRematch(room, "O");
    expect(secondVote).toEqual({
      accepted: true,
      started: true
    });
    expect(room.board.every((cell) => cell === 0)).toBe(true);
    expect(room.turn).toBe("X");
    expect(room.winner).toBeNull();
    expect(room.moveCount).toBe(0);
    expect(getRecordedMoveAck(room, "X", "move-x-1")).toBeNull();
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
    setPlayerConnection(room, "O", null, false);
    startReconnectDeadline(room, "O", 10_000, 30_000);

    const forfeited = applyDisconnectForfeitIfExpired(room, "O", 40_001);

    expect(forfeited).toBe(true);
    expect(room.winner).toBe("X");
    expect(room.winningLine).toBeNull();
    expect(room.players.O.reconnectDeadlineAt).toBeNull();
    expect(room.players.X.reconnectDeadlineAt).toBeNull();
  });
});
