import { describe, expect, it } from "vitest";
import { createWinningLinePositionBuffer } from "./winningLineGeometry";

describe("createWinningLinePositionBuffer", () => {
  it("returns null when points are not enough to draw a line", () => {
    expect(createWinningLinePositionBuffer(null)).toBeNull();
    expect(createWinningLinePositionBuffer([])).toBeNull();
    expect(createWinningLinePositionBuffer([[1, 2, 3]])).toBeNull();
  });

  it("flattens line points into position buffer", () => {
    const buffer = createWinningLinePositionBuffer([
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8]
    ]);

    expect(buffer).toEqual(new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8]));
  });
});
