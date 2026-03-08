import { describe, expect, it } from "vitest";
import { evaluateConnectionGuidance } from "./connectionGuidance";

function createDecision(
  overrides?: Partial<Parameters<typeof evaluateConnectionGuidance>[0]>
) {
  return evaluateConnectionGuidance({
    connectionStatus: "reconnecting",
    canObserveBoard: true,
    ...overrides
  });
}

describe("evaluateConnectionGuidance", () => {
  it("returns no guidance while online", () => {
    const decision = createDecision({
      connectionStatus: "online"
    });

    expect(decision.primaryHint).toBeNull();
    expect(decision.secondaryHint).toBeNull();
    expect(decision.statusLabel).toBe("在线");
    expect(decision.actionLabel).toBe("在线");
    expect(decision.spotlightTone).toBe("info");
    expect(decision.spotlightPriority).toBe(0);
  });

  it("includes observation hint when reconnecting and board is observable", () => {
    const decision = createDecision({
      connectionStatus: "reconnecting",
      canObserveBoard: true
    });

    expect(decision.primaryHint).toBe("网络重连中，请稍候，可点击棋盘切层观察");
    expect(decision.secondaryHint).toBe("网络重连中，请稍候，可点击棋盘切层观察");
    expect(decision.statusLabel).toBe("重连中");
    expect(decision.actionLabel).toBe("重连中");
    expect(decision.spotlightTone).toBe("critical");
    expect(decision.spotlightPriority).toBe(92);
  });

  it("omits observation hint when reconnecting and board is not observable", () => {
    const decision = createDecision({
      connectionStatus: "reconnecting",
      canObserveBoard: false
    });

    expect(decision.primaryHint).toBe("网络重连中，请稍候");
    expect(decision.actionLabel).toBe("重连中");
  });

  it("includes observation hint when offline and board is observable", () => {
    const decision = createDecision({
      connectionStatus: "offline",
      canObserveBoard: true
    });

    expect(decision.primaryHint).toBe("当前离线，暂不可操作，可点击棋盘切层观察");
    expect(decision.statusLabel).toBe("离线");
    expect(decision.actionLabel).toBe("离线中");
    expect(decision.spotlightTone).toBe("critical");
    expect(decision.spotlightPriority).toBe(100);
  });

  it("uses neutral connecting hint without observation instruction", () => {
    const decision = createDecision({
      connectionStatus: "connecting",
      canObserveBoard: true
    });

    expect(decision.primaryHint).toBe("正在连接服务器");
    expect(decision.secondaryHint).toBe("正在连接服务器");
    expect(decision.statusLabel).toBe("连接中");
    expect(decision.actionLabel).toBe("连接中");
    expect(decision.spotlightTone).toBe("info");
    expect(decision.spotlightPriority).toBe(36);
  });
});
