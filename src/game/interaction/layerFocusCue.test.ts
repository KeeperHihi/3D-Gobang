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
      source: "wheel"
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
});
