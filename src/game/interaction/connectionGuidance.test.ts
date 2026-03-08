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
  });

  it("includes observation hint when reconnecting and board is observable", () => {
    const decision = createDecision({
      connectionStatus: "reconnecting",
      canObserveBoard: true
    });

    expect(decision.primaryHint).toBe("网络重连中，请稍候，可点击棋盘切层观察");
    expect(decision.secondaryHint).toBe("网络重连中，请稍候，可点击棋盘切层观察");
  });

  it("omits observation hint when reconnecting and board is not observable", () => {
    const decision = createDecision({
      connectionStatus: "reconnecting",
      canObserveBoard: false
    });

    expect(decision.primaryHint).toBe("网络重连中，请稍候");
  });

  it("includes observation hint when offline and board is observable", () => {
    const decision = createDecision({
      connectionStatus: "offline",
      canObserveBoard: true
    });

    expect(decision.primaryHint).toBe("当前离线，暂不可操作，可点击棋盘切层观察");
  });

  it("uses neutral connecting hint without observation instruction", () => {
    const decision = createDecision({
      connectionStatus: "connecting",
      canObserveBoard: true
    });

    expect(decision.primaryHint).toBe("正在连接服务器");
    expect(decision.secondaryHint).toBe("正在连接服务器");
  });
});
