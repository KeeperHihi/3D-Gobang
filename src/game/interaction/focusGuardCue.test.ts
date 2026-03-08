import { describe, expect, it } from "vitest";
import {
  evaluateFocusGuardCue,
  FOCUS_GUARD_CUE_COOLDOWN_MS,
  FOCUS_GUARD_CUE_DURATION_MS
} from "./focusGuardCue";

function createDecision(overrides?: Partial<Parameters<typeof evaluateFocusGuardCue>[0]>) {
  return evaluateFocusGuardCue({
    reason: "turnHandover",
    targetLayer: 2,
    nowMs: 10_000,
    lastShownAtMs: null,
    ...overrides
  });
}

describe("evaluateFocusGuardCue", () => {
  it("shows handover cue with target layer", () => {
    const decision = createDecision();

    expect(decision.shouldShow).toBe(true);
    expect(decision.message).toBe("轮到你了，已切回推荐层 L3");
    expect(decision.shownAtMs).toBe(10_000);
    expect(decision.expiresAtMs).toBe(10_000 + FOCUS_GUARD_CUE_DURATION_MS);
  });

  it("shows urgent cue with target layer", () => {
    const decision = createDecision({
      reason: "urgent",
      targetLayer: 5
    });

    expect(decision.shouldShow).toBe(true);
    expect(decision.message).toBe("时间紧迫，已自动对焦关键层 L6");
  });

  it("does not show cue for idle reason", () => {
    const decision = createDecision({
      reason: "idle"
    });

    expect(decision.shouldShow).toBe(false);
    expect(decision.message).toBeNull();
  });

  it("suppresses repeated cue in cooldown window", () => {
    const decision = createDecision({
      nowMs: 10_000,
      lastShownAtMs: 10_000 - FOCUS_GUARD_CUE_COOLDOWN_MS + 1
    });

    expect(decision.shouldShow).toBe(false);
    expect(decision.message).toBeNull();
  });

  it("allows cue after cooldown elapsed", () => {
    const decision = createDecision({
      nowMs: 10_000,
      lastShownAtMs: 10_000 - FOCUS_GUARD_CUE_COOLDOWN_MS
    });

    expect(decision.shouldShow).toBe(true);
    expect(decision.message).toBe("轮到你了，已切回推荐层 L3");
  });
});
