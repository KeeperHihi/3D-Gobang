import { describe, expect, it } from "vitest";
import { resolveLayerStepFromWheelDelta, sanitizeLayerWheelDirection } from "./layerWheel";

describe("layerWheel", () => {
  it("uses forward-up as the default direction", () => {
    expect(sanitizeLayerWheelDirection(null)).toBe("forward-up");
    expect(sanitizeLayerWheelDirection("unknown")).toBe("forward-up");
  });

  it("keeps forward-down when explicitly configured", () => {
    expect(sanitizeLayerWheelDirection("forward-down")).toBe("forward-down");
  });

  it("maps wheel delta to layer steps in forward-up mode", () => {
    expect(resolveLayerStepFromWheelDelta(120, "forward-up")).toBe(1);
    expect(resolveLayerStepFromWheelDelta(-120, "forward-up")).toBe(-1);
  });

  it("maps wheel delta to layer steps in forward-down mode", () => {
    expect(resolveLayerStepFromWheelDelta(120, "forward-down")).toBe(-1);
    expect(resolveLayerStepFromWheelDelta(-120, "forward-down")).toBe(1);
  });

  it("returns null for non-directional wheel input", () => {
    expect(resolveLayerStepFromWheelDelta(0, "forward-up")).toBeNull();
    expect(resolveLayerStepFromWheelDelta(Number.NaN, "forward-up")).toBeNull();
  });
});
