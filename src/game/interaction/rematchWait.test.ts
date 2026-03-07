import { describe, expect, it } from "vitest";
import {
  REMATCH_WAIT_FALLBACK_AFTER_MS,
  createRematchWaitRoundKey,
  evaluateRematchWait,
  resolveRematchWaitStartedAtMs
} from "./rematchWait";

function createDecision(overrides?: Partial<Parameters<typeof evaluateRematchWait>[0]>) {
  return evaluateRematchWait({
    winner: "X",
    myRematchReady: true,
    opponentRematchReady: false,
    opponentConnected: true,
    settlementStartedAtMs: 10_000,
    nowMs: 14_000,
    ...overrides
  });
}

describe("createRematchWaitRoundKey", () => {
  it("changes key when settlement snapshot changes", () => {
    const keyA = createRematchWaitRoundKey({
      roomId: "room-1",
      winner: "X",
      lastMoveNumber: 20,
      lastMoveTimestamp: 100
    });
    const keyB = createRematchWaitRoundKey({
      roomId: "room-1",
      winner: "X",
      lastMoveNumber: 21,
      lastMoveTimestamp: 105
    });

    expect(keyA).not.toBe(keyB);
  });
});

describe("evaluateRematchWait", () => {
  it("starts waiting timer only after tracking conditions become true", () => {
    const startedAt = resolveRematchWaitStartedAtMs(
      null,
      {
        winner: "X",
        myRematchReady: true,
        opponentRematchReady: false,
        opponentConnected: true
      },
      50_000
    );
    const decision = evaluateRematchWait({
      winner: "X",
      myRematchReady: true,
      opponentRematchReady: false,
      opponentConnected: true,
      settlementStartedAtMs: startedAt,
      nowMs: 50_100
    });

    expect(startedAt).toBe(50_000);
    expect(decision.phase).toBe("waiting");
    expect(decision.canForceContinueMatch).toBe(false);
  });

  it("resets waiting timer when tracking conditions are no longer met", () => {
    const reset = resolveRematchWaitStartedAtMs(
      10_000,
      {
        winner: "X",
        myRematchReady: true,
        opponentRematchReady: true,
        opponentConnected: true
      },
      20_000
    );

    expect(reset).toBeNull();
  });

  it("stays in waiting phase before timeout", () => {
    const decision = createDecision({
      nowMs: 20_000
    });

    expect(decision.phase).toBe("waiting");
    expect(decision.canForceContinueMatch).toBe(false);
    expect(decision.remainingMs).toBe(2_000);
  });

  it("unlocks continue match after waiting timeout", () => {
    const decision = createDecision({
      nowMs: 10_000 + REMATCH_WAIT_FALLBACK_AFTER_MS + 1
    });

    expect(decision.phase).toBe("fallback-ready");
    expect(decision.canForceContinueMatch).toBe(true);
    expect(decision.remainingMs).toBe(0);
  });

  it("does not unlock fallback when opponent has already readied", () => {
    const decision = createDecision({
      nowMs: 25_000,
      opponentRematchReady: true
    });

    expect(decision.phase).toBe("idle");
    expect(decision.canForceContinueMatch).toBe(false);
    expect(decision.remainingMs).toBeNull();
  });

  it("does not enter waiting fallback outside terminal ready-check context", () => {
    const notTerminal = createDecision({
      winner: null
    });
    const opponentOffline = createDecision({
      opponentConnected: false
    });
    const notReadiedByMe = createDecision({
      myRematchReady: false
    });

    expect(notTerminal.phase).toBe("idle");
    expect(opponentOffline.phase).toBe("idle");
    expect(notReadiedByMe.phase).toBe("idle");
  });
});
