import { describe, expect, it } from "vitest";
import { createMatchBlockerOrchestrator } from "./matchBlockerOrchestrator";

function createDecision(
  overrides?: Partial<Parameters<typeof createMatchBlockerOrchestrator>[0]>
) {
  return createMatchBlockerOrchestrator({
    connectionStatus: "online",
    isQueuing: false,
    isRecoveringSession: false,
    sceneWarmupStatus: "idle",
    primaryActionDisabledReason: null,
    cancelAction: {
      visible: false,
      label: "一键取消匹配",
      enabled: false,
      disabledReason: null
    },
    retryWarmupAction: {
      visible: false,
      label: "一键重试预热",
      enabled: false,
      disabledReason: null
    },
    ...overrides
  });
}

describe("createMatchBlockerOrchestrator", () => {
  it("keeps single connection blocker for offline + warmup-failed", () => {
    const decision = createDecision({
      connectionStatus: "offline",
      sceneWarmupStatus: "failed",
      primaryActionDisabledReason: "连接恢复后即可开始匹配",
      cancelAction: {
        visible: true,
        label: "一键取消匹配",
        enabled: false,
        disabledReason: "离线，连接恢复后可取消匹配"
      },
      retryWarmupAction: {
        visible: true,
        label: "一键重试预热",
        enabled: false,
        disabledReason: "离线，连接恢复后可重试预热"
      }
    });

    expect(decision.primaryBlockerReason).toBe("连接恢复后即可开始匹配");
    expect(decision.suppressPrimaryActionReason).toBe(true);
    expect(decision.suppressCancelReason).toBe(true);
    expect(decision.suppressRetryWarmupReason).toBe(true);
  });

  it("keeps single connection blocker for reconnecting + queuing", () => {
    const decision = createDecision({
      connectionStatus: "reconnecting",
      isQueuing: true,
      primaryActionDisabledReason: "重连中，匹配将在连接恢复后继续",
      cancelAction: {
        visible: true,
        label: "一键取消匹配",
        enabled: false,
        disabledReason: "重连中，连接恢复后可取消匹配"
      }
    });

    expect(decision.primaryBlockerReason).toBe("重连中，匹配将在连接恢复后继续");
    expect(decision.suppressPrimaryActionReason).toBe(true);
    expect(decision.suppressCancelReason).toBe(true);
    expect(decision.suppressRetryWarmupReason).toBe(false);
  });

  it("prioritizes recovering blocker over other sources", () => {
    const decision = createDecision({
      connectionStatus: "offline",
      isQueuing: true,
      isRecoveringSession: true,
      sceneWarmupStatus: "failed",
      primaryActionDisabledReason: "检测到未完成对局，恢复完成前不可开始新匹配",
      cancelAction: {
        visible: true,
        label: "一键取消匹配",
        enabled: false,
        disabledReason: "正在恢复对局，暂不可取消匹配"
      },
      retryWarmupAction: {
        visible: true,
        label: "一键重试预热",
        enabled: false,
        disabledReason: "正在恢复对局，恢复完成后可重试预热"
      }
    });

    expect(decision.primaryBlockerReason).toBe("检测到未完成对局，恢复完成前不可开始新匹配");
    expect(decision.suppressPrimaryActionReason).toBe(true);
    expect(decision.suppressCancelReason).toBe(true);
    expect(decision.suppressRetryWarmupReason).toBe(true);
  });

  it("returns no blocker under online idle state", () => {
    const decision = createDecision();

    expect(decision.primaryBlockerReason).toBeNull();
    expect(decision.suppressPrimaryActionReason).toBe(false);
    expect(decision.suppressCancelReason).toBe(false);
    expect(decision.suppressRetryWarmupReason).toBe(false);
  });
});
