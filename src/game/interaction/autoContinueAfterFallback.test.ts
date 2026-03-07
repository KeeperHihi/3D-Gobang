import { describe, expect, it } from "vitest";
import {
  AUTO_CONTINUE_AFTER_FALLBACK_COUNTDOWN_MS,
  createAutoContinueAfterFallbackRoundKey,
  evaluateAutoContinueAfterFallback
} from "./autoContinueAfterFallback";

function createDecision(overrides?: Partial<Parameters<typeof evaluateAutoContinueAfterFallback>[0]>) {
  return evaluateAutoContinueAfterFallback({
    enabled: true,
    rematchWaitPhase: "fallback-ready",
    canContinueMatch: true,
    continueSubmitting: false,
    countdownStartedAtMs: null,
    nowMs: 20_000,
    alreadyCancelled: false,
    alreadyTriggered: false,
    ...overrides
  });
}

describe("createAutoContinueAfterFallbackRoundKey", () => {
  it("changes key when settlement snapshot changes", () => {
    const keyA = createAutoContinueAfterFallbackRoundKey({
      roomId: "room-1",
      winner: "X",
      lastMoveNumber: 17,
      lastMoveTimestamp: 100
    });
    const keyB = createAutoContinueAfterFallbackRoundKey({
      roomId: "room-1",
      winner: "X",
      lastMoveNumber: 18,
      lastMoveTimestamp: 101
    });

    expect(keyA).not.toBe(keyB);
  });
});

describe("evaluateAutoContinueAfterFallback", () => {
  it("starts countdown when fallback-ready can continue and feature enabled", () => {
    const decision = createDecision();

    expect(decision.phase).toBe("countdown");
    expect(decision.shouldStartCountdown).toBe(true);
    expect(decision.canCancel).toBe(true);
    expect(decision.countdownRemainingMs).toBe(AUTO_CONTINUE_AFTER_FALLBACK_COUNTDOWN_MS);
  });

  it("auto triggers after countdown expires", () => {
    const decision = createDecision({
      countdownStartedAtMs: 20_000 - AUTO_CONTINUE_AFTER_FALLBACK_COUNTDOWN_MS - 1
    });

    expect(decision.phase).toBe("armed");
    expect(decision.shouldAutoContinue).toBe(true);
  });

  it("stays cancelled after user cancellation", () => {
    const decision = createDecision({
      alreadyCancelled: true
    });

    expect(decision.phase).toBe("cancelled");
    expect(decision.shouldAutoContinue).toBe(false);
  });

  it("keeps cancelled phase even when continue submission is in progress", () => {
    const decision = createDecision({
      alreadyCancelled: true,
      continueSubmitting: true
    });

    expect(decision.phase).toBe("cancelled");
    expect(decision.shouldAutoContinue).toBe(false);
  });

  it("does not trigger while continue transaction is submitting", () => {
    const decision = createDecision({
      continueSubmitting: true
    });

    expect(decision.phase).toBe("armed");
    expect(decision.shouldAutoContinue).toBe(false);
    expect(decision.canCancel).toBe(false);
  });

  it("keeps manual behavior when feature disabled", () => {
    const decision = createDecision({
      enabled: false
    });

    expect(decision.phase).toBe("idle");
    expect(decision.shouldStartCountdown).toBe(false);
  });

  it("does not enter auto mode outside fallback-ready state", () => {
    const decision = createDecision({
      rematchWaitPhase: "waiting"
    });

    expect(decision.phase).toBe("idle");
    expect(decision.shouldAutoContinue).toBe(false);
  });
});
