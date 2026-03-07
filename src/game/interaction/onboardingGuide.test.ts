import { describe, expect, it } from "vitest";
import {
  createDefaultOnboardingProgress,
  createOnboardingGuideState,
  isOnboardingCompletedByPlayer,
  type OnboardingProgress
} from "./onboardingGuide";

function createState(progress?: Partial<OnboardingProgress>, enabled = true, canUsePrimaryAction = true) {
  return createOnboardingGuideState({
    enabled,
    canUsePrimaryAction,
    progress: {
      ...createDefaultOnboardingProgress(),
      ...progress
    }
  });
}

describe("createOnboardingGuideState", () => {
  it("starts with intro step for first-time players", () => {
    const state = createState();

    expect(state.step).toBe("intro");
    expect(state.visible).toBe(true);
    expect(state.stepIndex).toBe(1);
    expect(state.primaryActionLabel).toBe("开始引导");
  });

  it("moves to rotate step after intro acknowledgment", () => {
    const state = createState({
      introAcknowledged: true
    });

    expect(state.step).toBe("rotate");
    expect(state.visible).toBe(true);
    expect(state.stepIndex).toBe(2);
  });

  it("moves to place step after user rotated board", () => {
    const state = createState({
      introAcknowledged: true,
      hasRotated: true
    });

    expect(state.step).toBe("place");
    expect(state.visible).toBe(true);
    expect(state.stepIndex).toBe(3);
    expect(state.detail).toContain("主按钮");
  });

  it("adapts place hint when primary action is not available", () => {
    const state = createState(
      {
        introAcknowledged: true,
        hasRotated: true
      },
      true,
      false
    );

    expect(state.step).toBe("place");
    expect(state.detail).toContain("轮到你时");
  });

  it("completes onboarding after first successful move", () => {
    const state = createState({
      introAcknowledged: true,
      hasRotated: true,
      hasPlaced: true
    });

    expect(state.step).toBe("done");
    expect(state.visible).toBe(false);
    expect(state.completed).toBe(true);
  });

  it("completes onboarding immediately when skipped", () => {
    const state = createState({
      skipped: true
    });

    expect(state.step).toBe("done");
    expect(state.completed).toBe(true);
  });

  it("completes onboarding when guide is disabled", () => {
    const state = createState({}, false);

    expect(state.step).toBe("done");
    expect(state.completed).toBe(true);
  });
});

describe("isOnboardingCompletedByPlayer", () => {
  it("returns false when player has not skipped or placed", () => {
    expect(isOnboardingCompletedByPlayer(createDefaultOnboardingProgress())).toBe(false);
  });

  it("returns true when player skipped onboarding", () => {
    expect(
      isOnboardingCompletedByPlayer({
        ...createDefaultOnboardingProgress(),
        skipped: true
      })
    ).toBe(true);
  });

  it("returns true when player completed first placement", () => {
    expect(
      isOnboardingCompletedByPlayer({
        ...createDefaultOnboardingProgress(),
        hasPlaced: true
      })
    ).toBe(true);
  });
});
