import { describe, expect, it } from "vitest";
import type { MoveHint } from "../engine/moveHints";
import { evaluateLayerQuickNav } from "./layerQuickNav";

function createHint(layer: number): MoveHint {
  return {
    index: 0,
    coordinate: { x: 2, y: 2, z: layer },
    score: 100,
    priority: "best"
  };
}

function createDecision(
  overrides?: Partial<Parameters<typeof evaluateLayerQuickNav>[0]>
) {
  return evaluateLayerQuickNav({
    focusLayer: 2,
    boardSize: 5,
    hintMoves: [createHint(4)],
    lastMove: {
      player: "X",
      x: 1,
      y: 2,
      z: 1,
      moveNumber: 10,
      timestamp: 200
    },
    autoFocusLayer: 3,
    ...overrides
  });
}

describe("evaluateLayerQuickNav", () => {
  it("calculates prev/next availability at boundaries", () => {
    const top = createDecision({ focusLayer: 0 });
    const bottom = createDecision({ focusLayer: 4 });

    expect(top.canGoPrev).toBe(false);
    expect(top.prevLayer).toBeNull();
    expect(top.canGoNext).toBe(true);

    expect(bottom.canGoPrev).toBe(true);
    expect(bottom.canGoNext).toBe(false);
    expect(bottom.nextLayer).toBeNull();
  });

  it("prefers recommended layer for smart jump", () => {
    const decision = createDecision({
      focusLayer: 1,
      hintMoves: [createHint(4)],
      lastMove: {
        player: "O",
        x: 0,
        y: 0,
        z: 2,
        moveNumber: 11,
        timestamp: 201
      }
    });

    expect(decision.smartJumpLayer).toBe(4);
    expect(decision.smartJumpSource).toBe("recommended");
  });

  it("falls back to recent layer when recommended equals current", () => {
    const decision = createDecision({
      focusLayer: 4,
      hintMoves: [createHint(4)],
      lastMove: {
        player: "X",
        x: 1,
        y: 1,
        z: 2,
        moveNumber: 12,
        timestamp: 202
      }
    });

    expect(decision.smartJumpLayer).toBe(2);
    expect(decision.smartJumpSource).toBe("recent");
  });

  it("falls back to auto layer when no hint and no recent move", () => {
    const decision = createDecision({
      focusLayer: 1,
      hintMoves: [],
      lastMove: null,
      autoFocusLayer: 3
    });

    expect(decision.smartJumpLayer).toBe(3);
    expect(decision.smartJumpSource).toBe("auto");
  });

  it("keeps current layer when every target equals current", () => {
    const decision = createDecision({
      focusLayer: 2,
      hintMoves: [createHint(2)],
      lastMove: {
        player: "X",
        x: 0,
        y: 0,
        z: 2,
        moveNumber: 13,
        timestamp: 203
      },
      autoFocusLayer: 2
    });

    expect(decision.smartJumpLayer).toBe(2);
    expect(decision.smartJumpSource).toBe("current");
  });
});
