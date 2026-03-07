import { describe, expect, it } from "vitest";
import { createTurnNudgeTurnKey, shouldTriggerTurnNudge } from "./turnNudge";

function createDecision(overrides?: Partial<Parameters<typeof shouldTriggerTurnNudge>[0]>) {
  return shouldTriggerTurnNudge({
    enabled: true,
    connectionStatus: "online",
    winner: null,
    isMyTurn: true,
    wasMyTurn: false,
    canPlace: true,
    pageVisible: false,
    windowFocused: false,
    alreadyNudgedThisTurn: false,
    ...overrides
  });
}

describe("createTurnNudgeTurnKey", () => {
  it("changes key when turn context changes", () => {
    const keyA = createTurnNudgeTurnKey({
      roomId: "room-1",
      turn: "X",
      winner: null,
      lastMoveNumber: 12,
      turnDeadlineAt: 40_000
    });
    const keyB = createTurnNudgeTurnKey({
      roomId: "room-1",
      turn: "O",
      winner: null,
      lastMoveNumber: 13,
      turnDeadlineAt: 60_000
    });

    expect(keyA).not.toBe(keyB);
  });
});

describe("shouldTriggerTurnNudge", () => {
  it("triggers when turn switches to me while page is hidden", () => {
    const shouldNudge = createDecision();

    expect(shouldNudge).toBe(true);
  });

  it("does not trigger when page is foreground", () => {
    const shouldNudge = createDecision({
      pageVisible: true,
      windowFocused: true
    });

    expect(shouldNudge).toBe(false);
  });

  it("does not trigger repeatedly in the same turn", () => {
    const shouldNudge = createDecision({
      alreadyNudgedThisTurn: true
    });

    expect(shouldNudge).toBe(false);
  });

  it("does not trigger outside turn transition to me", () => {
    const alreadyMyTurn = createDecision({
      wasMyTurn: true
    });
    const notMyTurn = createDecision({
      isMyTurn: false
    });

    expect(alreadyMyTurn).toBe(false);
    expect(notMyTurn).toBe(false);
  });

  it("does not trigger when game ended or offline", () => {
    const winnerSettled = createDecision({
      winner: "X"
    });
    const offline = createDecision({
      connectionStatus: "reconnecting"
    });

    expect(winnerSettled).toBe(false);
    expect(offline).toBe(false);
  });
});
