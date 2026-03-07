import { describe, expect, it } from "vitest";
import {
  evaluateWarmupPolicy,
  normalizeWarmupEffectiveType
} from "./warmupPolicy";

function createDecision(
  overrides?: Partial<Parameters<typeof evaluateWarmupPolicy>[0]>
) {
  return evaluateWarmupPolicy({
    connectionStatus: "online",
    matchPhase: "idle",
    sceneWarmupStatus: "idle",
    effectiveType: "4g",
    saveData: false,
    pageVisible: true,
    hasUserIntent: false,
    retryCount: 0,
    ...overrides
  });
}

describe("normalizeWarmupEffectiveType", () => {
  it("normalizes unknown values to unknown", () => {
    expect(normalizeWarmupEffectiveType("wifi")).toBe("unknown");
    expect(normalizeWarmupEffectiveType(null)).toBe("unknown");
  });

  it("keeps supported effective types", () => {
    expect(normalizeWarmupEffectiveType("3g")).toBe("3g");
    expect(normalizeWarmupEffectiveType("4g")).toBe("4g");
  });
});

describe("evaluateWarmupPolicy", () => {
  it("allows idle auto warmup in stable network", () => {
    const decision = createDecision({
      effectiveType: "4g",
      saveData: false
    });

    expect(decision.shouldAutoWarmup).toBe(true);
    expect(decision.intentOnlyMode).toBe(false);
    expect(decision.shouldRetryWarmup).toBe(false);
  });

  it("blocks idle auto warmup in constrained network unless user has intent", () => {
    const blockedByNetwork = createDecision({
      effectiveType: "3g",
      saveData: false,
      hasUserIntent: false
    });
    const allowedByIntent = createDecision({
      effectiveType: "3g",
      saveData: false,
      hasUserIntent: true
    });
    const blockedBySaveData = createDecision({
      effectiveType: "4g",
      saveData: true,
      hasUserIntent: false
    });

    expect(blockedByNetwork.shouldAutoWarmup).toBe(false);
    expect(blockedByNetwork.intentOnlyMode).toBe(true);
    expect(allowedByIntent.shouldAutoWarmup).toBe(true);
    expect(blockedBySaveData.shouldAutoWarmup).toBe(false);
    expect(blockedBySaveData.intentOnlyMode).toBe(true);
  });

  it("triggers queue backoff retry when failed", () => {
    const firstRetry = createDecision({
      matchPhase: "queuing",
      sceneWarmupStatus: "failed",
      retryCount: 0
    });
    const thirdRetry = createDecision({
      matchPhase: "queuing",
      sceneWarmupStatus: "failed",
      retryCount: 2
    });

    expect(firstRetry.shouldRetryWarmup).toBe(true);
    expect(firstRetry.retryDelayMs).toBe(1_000);
    expect(thirdRetry.shouldRetryWarmup).toBe(true);
    expect(thirdRetry.retryDelayMs).toBe(4_000);
  });

  it("stops retrying when retry budget is exhausted", () => {
    const decision = createDecision({
      matchPhase: "queuing",
      sceneWarmupStatus: "failed",
      retryCount: 3
    });

    expect(decision.shouldRetryWarmup).toBe(false);
    expect(decision.retryDelayMs).toBeNull();
  });

  it("disables all auto behavior when page is hidden or connection is offline", () => {
    const hiddenDecision = createDecision({
      pageVisible: false
    });
    const offlineDecision = createDecision({
      connectionStatus: "offline"
    });

    expect(hiddenDecision.shouldAutoWarmup).toBe(false);
    expect(hiddenDecision.shouldRetryWarmup).toBe(false);
    expect(offlineDecision.shouldAutoWarmup).toBe(false);
    expect(offlineDecision.shouldRetryWarmup).toBe(false);
  });
});
