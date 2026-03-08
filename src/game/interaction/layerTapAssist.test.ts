import { describe, expect, it } from "vitest";
import { evaluateLayerTapAssist } from "./layerTapAssist";

function createDecision(
  overrides?: Partial<Parameters<typeof evaluateLayerTapAssist>[0]>
) {
  return evaluateLayerTapAssist({
    canPlace: true,
    isEmpty: true,
    inFocusLayer: true,
    targetLayer: 3,
    currentLayer: 3,
    ...overrides
  });
}

describe("evaluateLayerTapAssist", () => {
  it("returns place for empty cell in current focus layer", () => {
    const decision = createDecision({
      inFocusLayer: true
    });

    expect(decision.action).toBe("place");
    expect(decision.nextFocusLayer).toBeNull();
  });

  it("returns focus for empty cell in non-focus layer", () => {
    const decision = createDecision({
      inFocusLayer: false,
      targetLayer: 4,
      currentLayer: 2
    });

    expect(decision.action).toBe("focus");
    expect(decision.nextFocusLayer).toBe(4);
  });

  it("returns focus for occupied cell in non-focus layer", () => {
    const decision = createDecision({
      inFocusLayer: false,
      isEmpty: false,
      targetLayer: 5,
      currentLayer: 1
    });

    expect(decision.action).toBe("focus");
    expect(decision.nextFocusLayer).toBe(5);
  });

  it("returns focus for non-focus layer even when placement is unavailable", () => {
    const decision = createDecision({
      canPlace: false,
      inFocusLayer: false,
      targetLayer: 6,
      currentLayer: 0
    });

    expect(decision.action).toBe("focus");
    expect(decision.nextFocusLayer).toBe(6);
  });

  it("returns ignore when occupied in current focus layer", () => {
    const decision = createDecision({
      isEmpty: false,
      inFocusLayer: true
    });

    expect(decision.action).toBe("ignore");
    expect(decision.nextFocusLayer).toBeNull();
  });

  it("returns ignore in current focus layer when placement is unavailable", () => {
    const decision = createDecision({
      canPlace: false,
      inFocusLayer: true
    });

    expect(decision.action).toBe("ignore");
    expect(decision.nextFocusLayer).toBeNull();
  });

  it("returns place when current layer already equals target layer", () => {
    const decision = createDecision({
      inFocusLayer: false,
      currentLayer: 1,
      targetLayer: 1
    });

    expect(decision.action).toBe("place");
    expect(decision.nextFocusLayer).toBeNull();
  });
});
