import { describe, expect, it } from "vitest";
import {
  clampQualityLevelByCap,
  evaluateRenderBootstrap,
  RENDER_BOOT_MAX_DURATION_MS,
  RENDER_BOOT_MIN_DURATION_MS
} from "./renderBootstrap";

describe("evaluateRenderBootstrap", () => {
  it("keeps boot phase with ambient off and medium cap in auto mode", () => {
    const decision = evaluateRenderBootstrap({
      elapsedMs: 180,
      averageFps: null,
      qualityMode: "auto"
    });

    expect(decision.phase).toBe("boot");
    expect(decision.ambientEnabled).toBe(false);
    expect(decision.qualityCap).toBe("medium");
  });

  it("exits boot early when fps is stable after minimum duration", () => {
    const decision = evaluateRenderBootstrap({
      elapsedMs: RENDER_BOOT_MIN_DURATION_MS + 50,
      averageFps: 56,
      qualityMode: "auto"
    });

    expect(decision.phase).toBe("steady");
    expect(decision.ambientEnabled).toBe(true);
    expect(decision.qualityCap).toBeNull();
  });

  it("stays in boot before max duration when fps is not stable", () => {
    const decision = evaluateRenderBootstrap({
      elapsedMs: RENDER_BOOT_MIN_DURATION_MS + 100,
      averageFps: 33,
      qualityMode: "auto"
    });

    expect(decision.phase).toBe("boot");
    expect(decision.ambientEnabled).toBe(false);
  });

  it("forces steady phase once max duration is reached", () => {
    const decision = evaluateRenderBootstrap({
      elapsedMs: RENDER_BOOT_MAX_DURATION_MS,
      averageFps: null,
      qualityMode: "auto"
    });

    expect(decision.phase).toBe("steady");
    expect(decision.ambientEnabled).toBe(true);
    expect(decision.qualityCap).toBeNull();
  });

  it("does not cap quality in non-auto mode", () => {
    const decision = evaluateRenderBootstrap({
      elapsedMs: 200,
      averageFps: null,
      qualityMode: "quality"
    });

    expect(decision.phase).toBe("boot");
    expect(decision.qualityCap).toBeNull();
  });
});

describe("clampQualityLevelByCap", () => {
  it("keeps level when below or equal to cap", () => {
    expect(clampQualityLevelByCap("low", "medium")).toBe("low");
    expect(clampQualityLevelByCap("medium", "medium")).toBe("medium");
  });

  it("caps level when level is above cap", () => {
    expect(clampQualityLevelByCap("ultra", "medium")).toBe("medium");
    expect(clampQualityLevelByCap("high", "low")).toBe("low");
  });
});
