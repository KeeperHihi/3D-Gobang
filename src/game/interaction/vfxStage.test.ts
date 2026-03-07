import { describe, expect, it } from "vitest";
import { evaluateVfxStage } from "./vfxStage";

describe("evaluateVfxStage", () => {
  it("stays off during bootstrap regardless of fps", () => {
    const stage = evaluateVfxStage({
      renderBootstrapPhase: "boot",
      averageFps: 60,
      qualityLevel: "ultra",
      sparklesEnabled: true
    });

    expect(stage).toBe("off");
  });

  it("uses basic when fps sample is not available in steady phase", () => {
    const stage = evaluateVfxStage({
      renderBootstrapPhase: "steady",
      averageFps: null,
      qualityLevel: "high",
      sparklesEnabled: true
    });

    expect(stage).toBe("basic");
  });

  it("drops to off when fps is critically low", () => {
    const stage = evaluateVfxStage({
      renderBootstrapPhase: "steady",
      averageFps: 24,
      qualityLevel: "high",
      sparklesEnabled: true
    });

    expect(stage).toBe("off");
  });

  it("keeps basic stage for mid fps or low-quality profile", () => {
    const midFpsStage = evaluateVfxStage({
      renderBootstrapPhase: "steady",
      averageFps: 38,
      qualityLevel: "high",
      sparklesEnabled: true
    });
    const lowProfileStage = evaluateVfxStage({
      renderBootstrapPhase: "steady",
      averageFps: 58,
      qualityLevel: "low",
      sparklesEnabled: false
    });

    expect(midFpsStage).toBe("basic");
    expect(lowProfileStage).toBe("basic");
  });

  it("enables full stage only on stable high fps with capable profile", () => {
    const stage = evaluateVfxStage({
      renderBootstrapPhase: "steady",
      averageFps: 56,
      qualityLevel: "high",
      sparklesEnabled: true
    });

    expect(stage).toBe("full");
  });
});
