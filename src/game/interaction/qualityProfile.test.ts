import { describe, expect, it } from "vitest";
import {
  QUALITY_SWITCH_MIN_INTERVAL_MS,
  selectQualityLevel
} from "./qualityProfile";

describe("selectQualityLevel", () => {
  it("downgrades one level in auto mode when fps is low", () => {
    const nextLevel = selectQualityLevel({
      mode: "auto",
      currentLevel: "high",
      averageFps: 28,
      nowMs: 10_000,
      lastSwitchAtMs: 0
    });
    expect(nextLevel).toBe("medium");
  });

  it("upgrades one level in auto mode when fps is high", () => {
    const nextLevel = selectQualityLevel({
      mode: "auto",
      currentLevel: "medium",
      averageFps: 60,
      nowMs: 10_000,
      lastSwitchAtMs: 0
    });
    expect(nextLevel).toBe("high");
  });

  it("keeps level when switch interval has not elapsed", () => {
    const nextLevel = selectQualityLevel({
      mode: "auto",
      currentLevel: "high",
      averageFps: 20,
      nowMs: QUALITY_SWITCH_MIN_INTERVAL_MS - 100,
      lastSwitchAtMs: 0
    });
    expect(nextLevel).toBe("high");
  });

  it("keeps level when fps sample is unavailable", () => {
    const nextLevel = selectQualityLevel({
      mode: "auto",
      currentLevel: "high",
      averageFps: null,
      nowMs: 50_000,
      lastSwitchAtMs: 0
    });
    expect(nextLevel).toBe("high");
  });

  it("forces ultra when mode is quality-first", () => {
    const nextLevel = selectQualityLevel({
      mode: "quality",
      currentLevel: "low",
      averageFps: 20,
      nowMs: 5_000,
      lastSwitchAtMs: 0
    });
    expect(nextLevel).toBe("ultra");
  });

  it("forces low when mode is smooth-first", () => {
    const nextLevel = selectQualityLevel({
      mode: "smooth",
      currentLevel: "ultra",
      averageFps: 60,
      nowMs: 5_000,
      lastSwitchAtMs: 0
    });
    expect(nextLevel).toBe("low");
  });
});
