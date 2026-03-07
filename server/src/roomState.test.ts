import { describe, expect, it } from "vitest";
import { createRoomState, requestRematch } from "./roomState";

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
  });
});
