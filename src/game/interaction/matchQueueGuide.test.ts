import { describe, expect, it } from "vitest";
import { createMatchQueueGuide } from "./matchQueueGuide";

describe("createMatchQueueGuide", () => {
  it("returns start guidance when queue is idle", () => {
    const guide = createMatchQueueGuide({
      connectionStatus: "online",
      isQueuing: false,
      isRecoveringSession: false,
      waitingSeconds: 0,
      queueSize: 0
    });

    expect(guide.headline).toContain("服务器在线");
    expect(guide.primaryActionLabel).toBe("一键开始匹配");
    expect(guide.primaryActionDisabledReason).toBeNull();
  });

  it("returns quick queue guidance for early waiting stage", () => {
    const guide = createMatchQueueGuide({
      connectionStatus: "online",
      isQueuing: true,
      isRecoveringSession: false,
      waitingSeconds: 6,
      queueSize: 1
    });

    expect(guide.headline).toContain("寻找对手");
    expect(guide.primaryActionLabel).toBe("正在匹配对手...");
    expect(guide.primaryActionDisabledReason).toContain("取消匹配");
  });

  it("returns medium waiting guidance when queue exceeds first threshold", () => {
    const guide = createMatchQueueGuide({
      connectionStatus: "online",
      isQueuing: true,
      isRecoveringSession: false,
      waitingSeconds: 12,
      queueSize: 2
    });

    expect(guide.headline).toContain("稍有等待");
    expect(guide.detail).toContain("队列");
    expect(guide.primaryActionLabel).toBe("正在匹配对手...");
  });

  it("returns long waiting guidance after second threshold", () => {
    const guide = createMatchQueueGuide({
      connectionStatus: "online",
      isQueuing: true,
      isRecoveringSession: false,
      waitingSeconds: 26,
      queueSize: 1
    });

    expect(guide.headline).toContain("等待时间较长");
    expect(guide.primaryActionDisabledReason).toContain("匹配中");
  });

  it("returns reconnect guidance with disabled action semantics", () => {
    const guide = createMatchQueueGuide({
      connectionStatus: "reconnecting",
      isQueuing: false,
      isRecoveringSession: false,
      waitingSeconds: 9,
      queueSize: 1
    });

    expect(guide.headline).toContain("重连");
    expect(guide.primaryActionLabel).toBe("重连中");
    expect(guide.primaryActionDisabledReason).toContain("连接恢复");
  });

  it("returns connecting guidance with disabled action semantics", () => {
    const guide = createMatchQueueGuide({
      connectionStatus: "connecting",
      isQueuing: false,
      isRecoveringSession: false,
      waitingSeconds: 0,
      queueSize: 0
    });

    expect(guide.headline).toContain("连接服务器");
    expect(guide.primaryActionLabel).toBe("连接中");
    expect(guide.primaryActionDisabledReason).toContain("连接恢复");
  });

  it("returns offline guidance with disabled action semantics", () => {
    const guide = createMatchQueueGuide({
      connectionStatus: "offline",
      isQueuing: false,
      isRecoveringSession: false,
      waitingSeconds: 0,
      queueSize: 0
    });

    expect(guide.headline).toContain("离线");
    expect(guide.primaryActionLabel).toBe("离线中");
    expect(guide.primaryActionDisabledReason).toContain("连接恢复");
  });

  it("keeps queuing action label even when connection is reconnecting", () => {
    const guide = createMatchQueueGuide({
      connectionStatus: "reconnecting",
      isQueuing: true,
      isRecoveringSession: false,
      waitingSeconds: 12,
      queueSize: 1
    });

    expect(guide.primaryActionLabel).toBe("正在匹配对手...");
    expect(guide.primaryActionDisabledReason).toContain("重连中");
  });

  it("returns recovery guidance when an unfinished session exists", () => {
    const guide = createMatchQueueGuide({
      connectionStatus: "online",
      isQueuing: false,
      isRecoveringSession: true,
      waitingSeconds: 0,
      queueSize: 0
    });

    expect(guide.headline).toContain("恢复");
    expect(guide.detail).toContain("自动恢复");
    expect(guide.primaryActionLabel).toBe("正在恢复对局...");
    expect(guide.primaryActionDisabledReason).toContain("恢复");
  });

  it("keeps recovery action label as highest priority under offline state", () => {
    const guide = createMatchQueueGuide({
      connectionStatus: "offline",
      isQueuing: false,
      isRecoveringSession: true,
      waitingSeconds: 0,
      queueSize: 0
    });

    expect(guide.primaryActionLabel).toBe("正在恢复对局...");
    expect(guide.primaryActionDisabledReason).toContain("恢复后");
  });
});
