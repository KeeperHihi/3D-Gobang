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
  });

  it("returns reconnect guidance when connection is unstable", () => {
    const guide = createMatchQueueGuide({
      connectionStatus: "reconnecting",
      isQueuing: true,
      isRecoveringSession: false,
      waitingSeconds: 9,
      queueSize: 1
    });

    expect(guide.headline).toContain("重连");
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
  });
});
