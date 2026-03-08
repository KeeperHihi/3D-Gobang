import { describe, expect, it } from "vitest";
import { createMatchSecondaryActions } from "./matchSecondaryActions";

function createDecision(
  overrides?: Partial<Parameters<typeof createMatchSecondaryActions>[0]>
) {
  return createMatchSecondaryActions({
    connectionStatus: "online",
    isQueuing: false,
    isRecoveringSession: false,
    sceneWarmupStatus: "idle",
    ...overrides
  });
}

describe("createMatchSecondaryActions", () => {
  it("keeps cancel action enabled when queuing online", () => {
    const decision = createDecision({
      isQueuing: true,
      connectionStatus: "online"
    });

    expect(decision.cancelAction.visible).toBe(true);
    expect(decision.cancelAction.enabled).toBe(true);
    expect(decision.cancelAction.disabledReason).toBeNull();
  });

  it("disables cancel action with reconnect reason when queuing but reconnecting", () => {
    const decision = createDecision({
      isQueuing: true,
      connectionStatus: "reconnecting"
    });

    expect(decision.cancelAction.visible).toBe(true);
    expect(decision.cancelAction.enabled).toBe(false);
    expect(decision.cancelAction.disabledReason).toContain("重连中");
  });

  it("keeps retry warmup action enabled when failed and online", () => {
    const decision = createDecision({
      connectionStatus: "online",
      sceneWarmupStatus: "failed"
    });

    expect(decision.retryWarmupAction.visible).toBe(true);
    expect(decision.retryWarmupAction.enabled).toBe(true);
    expect(decision.retryWarmupAction.disabledReason).toBeNull();
  });

  it("disables retry warmup action with offline reason when failed and offline", () => {
    const decision = createDecision({
      connectionStatus: "offline",
      sceneWarmupStatus: "failed"
    });

    expect(decision.retryWarmupAction.visible).toBe(true);
    expect(decision.retryWarmupAction.enabled).toBe(false);
    expect(decision.retryWarmupAction.disabledReason).toContain("离线");
  });

  it("keeps recovering semantics as highest priority for both secondary actions", () => {
    const decision = createDecision({
      connectionStatus: "offline",
      isQueuing: true,
      isRecoveringSession: true,
      sceneWarmupStatus: "failed"
    });

    expect(decision.cancelAction.visible).toBe(true);
    expect(decision.cancelAction.enabled).toBe(false);
    expect(decision.cancelAction.disabledReason).toContain("恢复");

    expect(decision.retryWarmupAction.visible).toBe(true);
    expect(decision.retryWarmupAction.enabled).toBe(false);
    expect(decision.retryWarmupAction.disabledReason).toContain("恢复");
  });
});
