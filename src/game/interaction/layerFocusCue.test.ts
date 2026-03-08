import { describe, expect, it } from "vitest";
import {
  evaluateLayerFocusCue,
  LAYER_FOCUS_CUE_COOLDOWN_MS,
  LAYER_FOCUS_CUE_DURATION_MS
} from "./layerFocusCue";

function createDecision(overrides?: Partial<Parameters<typeof evaluateLayerFocusCue>[0]>) {
  return evaluateLayerFocusCue({
    source: "tap-focus",
    fromLayer: 2,
    toLayer: 4,
    canPlaceNow: true,
    blockReason: "unknown",
    nowMs: 10_000,
    lastShownAtMs: null,
    ...overrides
  });
}

describe("evaluateLayerFocusCue", () => {
  it("shows cue for tap-focus layer switch", () => {
    const decision = createDecision();

    expect(decision.shouldShow).toBe(true);
    expect(decision.message).toBe("已切到 L5，再次点击空位即可落子");
    expect(decision.shownAtMs).toBe(10_000);
    expect(decision.expiresAtMs).toBe(10_000 + LAYER_FOCUS_CUE_DURATION_MS);
  });

  it("does not show cue for non-tap sources", () => {
    const decision = createDecision({
      source: "button"
    });

    expect(decision.shouldShow).toBe(false);
    expect(decision.message).toBeNull();
  });

  it("does not show cue when layer does not change", () => {
    const decision = createDecision({
      fromLayer: 3,
      toLayer: 3
    });

    expect(decision.shouldShow).toBe(false);
    expect(decision.expiresAtMs).toBeNull();
  });

  it("suppresses cue during cooldown window", () => {
    const decision = createDecision({
      nowMs: 10_000,
      lastShownAtMs: 10_000 - LAYER_FOCUS_CUE_COOLDOWN_MS + 1
    });

    expect(decision.shouldShow).toBe(false);
    expect(decision.message).toBeNull();
  });

  it("allows cue when cooldown elapsed", () => {
    const decision = createDecision({
      nowMs: 10_000,
      lastShownAtMs: 10_000 - LAYER_FOCUS_CUE_COOLDOWN_MS
    });

    expect(decision.shouldShow).toBe(true);
    expect(decision.message).toBe("已切到 L5，再次点击空位即可落子");
  });

  it("shows opponent-turn waiting message when cannot place", () => {
    const decision = createDecision({
      canPlaceNow: false,
      blockReason: "opponent-turn"
    });

    expect(decision.shouldShow).toBe(true);
    expect(decision.message).toBe("已切到 L5，当前是对手回合");
  });

  it("shows offline waiting message when disconnected", () => {
    const decision = createDecision({
      canPlaceNow: false,
      blockReason: "offline"
    });

    expect(decision.shouldShow).toBe(true);
    expect(decision.message).toBe("已切到 L5，网络恢复后可继续落子");
  });

  it("shows pending message when previous move is still submitting", () => {
    const decision = createDecision({
      canPlaceNow: false,
      blockReason: "pending"
    });

    expect(decision.shouldShow).toBe(true);
    expect(decision.message).toBe("已切到 L5，正在提交上一步落子");
  });

  it("shows match-ended message when winner is settled", () => {
    const decision = createDecision({
      canPlaceNow: false,
      blockReason: "winner"
    });

    expect(decision.shouldShow).toBe(true);
    expect(decision.message).toBe("已切到 L5，本局已结束");
  });
});
