import { describe, expect, it } from "vitest";
import {
  createFocusGuardInteractionCue,
  createInteractionCue,
  createLayerFocusInteractionCue,
  resolveCueAfterTick,
  resolveNextCue,
  type InteractionCue
} from "./interactionCue";

function createCue(overrides?: Partial<InteractionCue>): InteractionCue {
  return {
    kind: "tap-focus",
    tone: "focus-cue",
    message: "已切到 L3，再次点击空位即可落子",
    priority: 40,
    shownAtMs: 10_000,
    expiresAtMs: 11_000,
    ...overrides
  };
}

describe("resolveNextCue", () => {
  it("replaces lower-priority cue with higher-priority cue", () => {
    const current = createCue({
      kind: "tap-focus",
      priority: 40,
      shownAtMs: 10_000,
      expiresAtMs: 11_000
    });
    const incoming = createCue({
      kind: "focus-guard",
      tone: "focus-guard-cue",
      message: "轮到你了，已切回推荐层 L4",
      priority: 60,
      shownAtMs: 10_200,
      expiresAtMs: 11_400
    });

    const next = resolveNextCue(current, incoming, 10_200);

    expect(next).toEqual(incoming);
  });

  it("does not restore expired old low-priority cue when no new event arrives", () => {
    const previousHigh = createCue({
      kind: "focus-guard",
      tone: "focus-guard-cue",
      message: "时间紧迫，已自动对焦关键层 L4",
      priority: 60,
      shownAtMs: 10_300,
      expiresAtMs: 10_900
    });

    const next = resolveNextCue(previousHigh, null, 10_900);

    expect(next).toBeNull();
  });

  it("replaces equal-priority cue with newer event", () => {
    const current = createCue({
      priority: 40,
      message: "旧提示",
      shownAtMs: 10_000,
      expiresAtMs: 11_000
    });
    const incoming = createCue({
      priority: 40,
      message: "新提示",
      shownAtMs: 10_200,
      expiresAtMs: 11_200
    });

    const next = resolveNextCue(current, incoming, 10_200);

    expect(next).toEqual(incoming);
  });
});

describe("resolveCueAfterTick", () => {
  it("clears cue after expiry", () => {
    const next = resolveCueAfterTick(
      createCue({
        shownAtMs: 10_000,
        expiresAtMs: 10_800
      }),
      10_800
    );

    expect(next).toBeNull();
  });
});

describe("interaction cue factory", () => {
  it("creates tap-focus cue with mapped tone and priority", () => {
    const cue = createLayerFocusInteractionCue(
      {
        shouldShow: true,
        message: "已切到 L4，再次点击空位即可落子",
        shownAtMs: 12_000,
        expiresAtMs: 13_000
      },
      11_500
    );

    expect(cue).toEqual({
      kind: "tap-focus",
      tone: "focus-cue",
      message: "已切到 L4，再次点击空位即可落子",
      priority: 40,
      shownAtMs: 12_000,
      expiresAtMs: 13_000
    });
  });

  it("creates focus-guard cue with mapped tone and priority", () => {
    const cue = createFocusGuardInteractionCue(
      {
        shouldShow: true,
        message: "轮到你了，已切回推荐层 L3",
        shownAtMs: 20_100,
        expiresAtMs: 21_300
      },
      20_000
    );

    expect(cue).toEqual({
      kind: "focus-guard",
      tone: "focus-guard-cue",
      message: "轮到你了，已切回推荐层 L3",
      priority: 60,
      shownAtMs: 20_100,
      expiresAtMs: 21_300
    });
  });

  it("returns null when decision should not show", () => {
    const cue = createInteractionCue(
      "tap-focus",
      {
        shouldShow: false,
        message: null,
        shownAtMs: null,
        expiresAtMs: null
      },
      15_000
    );

    expect(cue).toBeNull();
  });
});
