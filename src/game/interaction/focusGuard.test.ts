import { describe, expect, it } from "vitest";
import {
  createFocusGuardTurnKey,
  evaluateFocusGuard,
  FOCUS_GUARD_URGENT_THRESHOLD_MS
} from "./focusGuard";

function createDecision(overrides?: Partial<Parameters<typeof evaluateFocusGuard>[0]>) {
  return evaluateFocusGuard({
    focusMode: "manual",
    currentLayer: 4,
    autoFocusLayer: 1,
    boardSize: 5,
    isMyTurn: true,
    wasMyTurn: false,
    turnRemainingMs: 12_000,
    lastManualInputAtMs: null,
    nowMs: 20_000,
    alreadyTriggeredThisTurn: false,
    ...overrides
  });
}

describe("createFocusGuardTurnKey", () => {
  it("changes when turn snapshot changes", () => {
    const keyA = createFocusGuardTurnKey({
      roomId: "room-1",
      turn: "X",
      lastMoveNumber: 10,
      turnDeadlineAt: 100
    });
    const keyB = createFocusGuardTurnKey({
      roomId: "room-1",
      turn: "O",
      lastMoveNumber: 11,
      turnDeadlineAt: 101
    });

    expect(keyA).not.toBe(keyB);
  });
});

describe("evaluateFocusGuard", () => {
  it("triggers on handover to my turn when manual layer is offset", () => {
    const decision = createDecision({
      wasMyTurn: false
    });

    expect(decision.shouldRestoreAuto).toBe(true);
    expect(decision.reason).toBe("turnHandover");
    expect(decision.targetLayer).toBe(1);
  });

  it("triggers urgent rescue when turn is already mine and time is critical", () => {
    const decision = createDecision({
      wasMyTurn: true,
      turnRemainingMs: FOCUS_GUARD_URGENT_THRESHOLD_MS - 100
    });

    expect(decision.shouldRestoreAuto).toBe(true);
    expect(decision.reason).toBe("urgent");
  });

  it("does not trigger when recent manual input exists", () => {
    const decision = createDecision({
      wasMyTurn: false,
      lastManualInputAtMs: 19_400,
      nowMs: 20_000
    });

    expect(decision.shouldRestoreAuto).toBe(false);
    expect(decision.reason).toBe("idle");
  });

  it("does not trigger when already in auto target layer", () => {
    const decision = createDecision({
      currentLayer: 1
    });

    expect(decision.shouldRestoreAuto).toBe(false);
    expect(decision.reason).toBe("idle");
  });

  it("does not trigger outside my turn or after triggered once", () => {
    const outsideMyTurn = createDecision({
      isMyTurn: false,
      wasMyTurn: false
    });
    const triggered = createDecision({
      wasMyTurn: false,
      alreadyTriggeredThisTurn: true
    });

    expect(outsideMyTurn.shouldRestoreAuto).toBe(false);
    expect(triggered.shouldRestoreAuto).toBe(false);
  });
});
