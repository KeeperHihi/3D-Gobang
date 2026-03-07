import { describe, expect, it } from "vitest";
import { toLinearIndex } from "../engine/board";
import {
  createWinLineDirectorRoundKey,
  evaluateWinLineDirector,
  type WinLineDirectorInput
} from "./winLineDirector";

const BOARD_SIZE = 5;

function createLine(points: Array<{ x: number; y: number; z: number }>): number[] {
  return points.map((point) => toLinearIndex(point, BOARD_SIZE));
}

function createDecision(overrides?: Partial<WinLineDirectorInput>) {
  return evaluateWinLineDirector({
    size: BOARD_SIZE,
    winningLine: createLine([
      { x: 0, y: 2, z: 1 },
      { x: 1, y: 2, z: 1 },
      { x: 2, y: 2, z: 1 },
      { x: 3, y: 2, z: 1 },
      { x: 4, y: 2, z: 1 }
    ]),
    preferReducedMotion: false,
    ...overrides
  });
}

describe("createWinLineDirectorRoundKey", () => {
  it("changes key when settlement snapshot changes", () => {
    const keyA = createWinLineDirectorRoundKey({
      roomId: "room-1",
      winner: "X",
      lastMoveNumber: 33,
      lastMoveTimestamp: 100
    });
    const keyB = createWinLineDirectorRoundKey({
      roomId: "room-1",
      winner: "X",
      lastMoveNumber: 34,
      lastMoveTimestamp: 101
    });

    expect(keyA).not.toBe(keyB);
  });
});

describe("evaluateWinLineDirector", () => {
  it("returns null when no winning line exists", () => {
    const decision = createDecision({
      winningLine: null
    });

    expect(decision).toBeNull();
  });

  it("classifies same-layer straight line and computes center focus", () => {
    const decision = createDecision();
    expect(decision).not.toBeNull();
    expect(decision?.lineType).toBe("same-layer-straight");
    expect(decision?.lineLabel).toBe("同层直线五连");
    expect(decision?.focusCoordinate).toEqual({
      x: 2,
      y: 2,
      z: 1
    });
    expect(decision?.shouldAnimate).toBe(true);
  });

  it("classifies cross-layer diagonal line", () => {
    const decision = createDecision({
      winningLine: createLine([
        { x: 0, y: 2, z: 0 },
        { x: 1, y: 2, z: 1 },
        { x: 2, y: 2, z: 2 },
        { x: 3, y: 2, z: 3 },
        { x: 4, y: 2, z: 4 }
      ])
    });

    expect(decision?.lineType).toBe("cross-layer-diagonal");
    expect(decision?.lineLabel).toBe("跨层斜线五连");
  });

  it("classifies space diagonal line", () => {
    const decision = createDecision({
      winningLine: createLine([
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 1, z: 1 },
        { x: 2, y: 2, z: 2 },
        { x: 3, y: 3, z: 3 },
        { x: 4, y: 4, z: 4 }
      ])
    });

    expect(decision?.lineType).toBe("space-diagonal");
    expect(decision?.lineLabel).toBe("空间对角线五连");
  });

  it("falls back to unknown line type for invalid path", () => {
    const decision = createDecision({
      winningLine: createLine([
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 2, y: 1, z: 0 },
        { x: 3, y: 1, z: 0 },
        { x: 4, y: 1, z: 0 }
      ])
    });

    expect(decision?.lineType).toBe("unknown");
    expect(decision?.lineLabel).toBe("五连胜线");
    expect(decision?.shouldAnimate).toBe(false);
  });

  it("disables animation when reduced-motion is preferred", () => {
    const decision = createDecision({
      preferReducedMotion: true
    });

    expect(decision?.lineType).toBe("same-layer-straight");
    expect(decision?.shouldAnimate).toBe(false);
  });
});
