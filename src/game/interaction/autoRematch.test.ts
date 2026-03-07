import { describe, expect, it } from "vitest";
import {
  AUTO_REMATCH_COUNTDOWN_MS,
  createAutoRematchRoundKey,
  evaluateAutoRematch
} from "./autoRematch";

function createDecision(overrides?: Partial<Parameters<typeof evaluateAutoRematch>[0]>) {
  return evaluateAutoRematch({
    enabled: true,
    winner: "X",
    opponentConnected: true,
    canContinueMatch: false,
    myRematchReady: false,
    countdownStartedAtMs: null,
    nowMs: 10_000,
    alreadyCancelled: false,
    alreadyTriggered: false,
    ...overrides
  });
}

describe("createAutoRematchRoundKey", () => {
  it("changes key when settlement snapshot changes", () => {
    const keyA = createAutoRematchRoundKey({
      roomId: "room-1",
      winner: "X",
      lastMoveNumber: 17,
      lastMoveTimestamp: 1_000
    });
    const keyB = createAutoRematchRoundKey({
      roomId: "room-1",
      winner: "O",
      lastMoveNumber: 17,
      lastMoveTimestamp: 1_001
    });

    expect(keyA).not.toBe(keyB);
  });
});

describe("evaluateAutoRematch", () => {
  it("starts countdown in valid endgame context", () => {
    const decision = createDecision();

    expect(decision.phase).toBe("countdown");
    expect(decision.shouldStartCountdown).toBe(true);
    expect(decision.canCancel).toBe(true);
    expect(decision.countdownRemainingMs).toBe(AUTO_REMATCH_COUNTDOWN_MS);
  });

  it("triggers auto rematch when countdown expires", () => {
    const decision = createDecision({
      countdownStartedAtMs: 10_000 - AUTO_REMATCH_COUNTDOWN_MS - 10
    });

    expect(decision.phase).toBe("armed");
    expect(decision.shouldAutoRematch).toBe(true);
  });

  it("stays cancelled after user cancels", () => {
    const decision = createDecision({
      alreadyCancelled: true
    });

    expect(decision.phase).toBe("cancelled");
    expect(decision.shouldAutoRematch).toBe(false);
  });

  it("shows armed once player is already ready even if auto was cancelled", () => {
    const decision = createDecision({
      alreadyCancelled: true,
      myRematchReady: true
    });

    expect(decision.phase).toBe("armed");
    expect(decision.shouldAutoRematch).toBe(false);
  });

  it("prevents duplicate auto rematch trigger", () => {
    const decision = createDecision({
      alreadyTriggered: true
    });

    expect(decision.phase).toBe("armed");
    expect(decision.shouldAutoRematch).toBe(false);
  });

  it("does nothing when feature is disabled", () => {
    const decision = createDecision({
      enabled: false
    });

    expect(decision.phase).toBe("idle");
    expect(decision.shouldStartCountdown).toBe(false);
  });
});
