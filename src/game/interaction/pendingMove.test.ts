import { describe, expect, it } from "vitest";
import type { RoomSnapshot } from "../../network/protocol";
import {
  isPendingMoveStale,
  shouldClearPendingMove,
  type PendingMoveState
} from "./pendingMove";

function createSnapshot(partial?: Partial<RoomSnapshot>): RoomSnapshot {
  return {
    roomId: "room-1",
    size: 5,
    connect: 5,
    board: Array.from({ length: 125 }, () => 0),
    turn: "X",
    winner: null,
    lastMove: null,
    winningLine: null,
    players: {
      X: {
        connected: true,
        reconnectDeadlineAt: null
      },
      O: {
        connected: true,
        reconnectDeadlineAt: null
      }
    },
    rematchReady: {
      X: false,
      O: false
    },
    ...partial
  };
}

function createPendingMove(partial?: Partial<PendingMoveState>): PendingMoveState {
  return {
    clientMoveId: "move-1",
    coordinate: { x: 2, y: 1, z: 3 },
    player: "X",
    status: "pending",
    submittedAt: 1000,
    ...partial
  };
}

describe("pendingMove helpers", () => {
  it("clears pending when authoritative board already has the expected stone", () => {
    const snapshot = createSnapshot();
    const pendingMove = createPendingMove();
    const index = pendingMove.coordinate.x + pendingMove.coordinate.y * 5 + pendingMove.coordinate.z * 25;
    snapshot.board[index] = 1;

    expect(shouldClearPendingMove(snapshot, pendingMove)).toBe(true);
  });

  it("clears pending when lastMove matches pending coordinate and player", () => {
    const pendingMove = createPendingMove();
    const snapshot = createSnapshot({
      lastMove: {
        ...pendingMove.coordinate,
        player: "X",
        moveNumber: 8,
        timestamp: 123
      }
    });

    expect(shouldClearPendingMove(snapshot, pendingMove)).toBe(true);
  });

  it("clears accepted pending move once room move number catches up", () => {
    const pendingMove = createPendingMove({
      status: "accepted",
      roomMoveNumber: 6
    });
    const snapshot = createSnapshot({
      lastMove: {
        x: 0,
        y: 0,
        z: 0,
        player: "O",
        moveNumber: 6,
        timestamp: 300
      }
    });

    expect(shouldClearPendingMove(snapshot, pendingMove)).toBe(true);
  });

  it("keeps pending when no authoritative evidence exists", () => {
    const snapshot = createSnapshot();
    const pendingMove = createPendingMove();

    expect(shouldClearPendingMove(snapshot, pendingMove)).toBe(false);
  });

  it("marks pending move as stale after timeout", () => {
    const pendingMove = createPendingMove({
      submittedAt: 100
    });

    expect(isPendingMoveStale(pendingMove, 7101, 7000)).toBe(true);
    expect(isPendingMoveStale(pendingMove, 7099, 7000)).toBe(false);
  });

  it("never marks accepted move as stale", () => {
    const acceptedMove = createPendingMove({
      status: "accepted",
      submittedAt: 100
    });

    expect(isPendingMoveStale(acceptedMove, 100000, 1)).toBe(false);
  });
});
