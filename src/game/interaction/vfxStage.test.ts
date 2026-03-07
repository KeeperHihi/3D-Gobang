import { describe, expect, it } from "vitest";
import {
  VFX_STAGE_HOLD_MS,
  evaluateVfxStage,
  evaluateVfxStageTransition
} from "./vfxStage";

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

describe("evaluateVfxStageTransition", () => {
  it("guards against threshold jitter around basic/full boundary", () => {
    const keepBasic = evaluateVfxStageTransition({
      currentStage: "basic",
      targetStage: "full",
      stageStartedAtMs: 0,
      nowMs: 4000,
      averageFps: 47
    });
    const keepFull = evaluateVfxStageTransition({
      currentStage: "full",
      targetStage: "basic",
      stageStartedAtMs: 0,
      nowMs: 4000,
      averageFps: 45
    });

    expect(keepBasic).toMatchObject({
      nextStage: "basic",
      switched: false,
      reason: "hysteresis_guard"
    });
    expect(keepFull).toMatchObject({
      nextStage: "full",
      switched: false,
      reason: "hysteresis_guard"
    });
  });

  it("blocks switching inside hold window then allows upgrade after hold", () => {
    const held = evaluateVfxStageTransition({
      currentStage: "basic",
      targetStage: "full",
      stageStartedAtMs: 1000,
      nowMs: 1000 + VFX_STAGE_HOLD_MS - 1,
      averageFps: 58
    });
    const upgraded = evaluateVfxStageTransition({
      currentStage: "basic",
      targetStage: "full",
      stageStartedAtMs: 1000,
      nowMs: 1000 + VFX_STAGE_HOLD_MS + 1,
      averageFps: 58
    });

    expect(held).toMatchObject({
      nextStage: "basic",
      switched: false,
      reason: "hold_window"
    });
    expect(upgraded).toMatchObject({
      nextStage: "full",
      switched: true,
      reason: "upgrade"
    });
  });

  it("downgrades immediately on emergency low fps", () => {
    const decision = evaluateVfxStageTransition({
      currentStage: "full",
      targetStage: "full",
      stageStartedAtMs: 1000,
      nowMs: 1100,
      averageFps: 20
    });

    expect(decision).toMatchObject({
      nextStage: "off",
      switched: true,
      reason: "emergency_low_fps"
    });
  });

  it("allows constraint downgrade without waiting for hold", () => {
    const decision = evaluateVfxStageTransition({
      currentStage: "full",
      targetStage: "basic",
      stageStartedAtMs: 1000,
      nowMs: 1100,
      averageFps: 60
    });

    expect(decision).toMatchObject({
      nextStage: "basic",
      switched: true,
      reason: "constraint_downgrade"
    });
  });
});
