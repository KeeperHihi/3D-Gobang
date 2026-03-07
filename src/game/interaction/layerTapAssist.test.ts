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

  it("returns ignore for empty cell in non-focus layer", () => {
    const decision = createDecision({
      inFocusLayer: false,
      targetLayer: 4,
      currentLayer: 2
    });

    expect(decision.action).toBe("ignore");
    expect(decision.nextFocusLayer).toBeNull();
  });

  it("returns ignore when cell is occupied", () => {
    const decision = createDecision({
      isEmpty: false,
      inFocusLayer: false
    });

    expect(decision.action).toBe("ignore");
  });

  it("returns ignore when placement is unavailable", () => {
    const decision = createDecision({
      canPlace: false,
      inFocusLayer: false
    });

    expect(decision.action).toBe("ignore");
  });
});
