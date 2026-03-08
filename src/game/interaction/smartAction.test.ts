import { describe, expect, it } from "vitest";
import type { MoveHint } from "../engine/moveHints";
import type { PlayerMark, Winner } from "../../network/protocol";
import { createSmartActionState } from "./smartAction";

function createHint(priority: MoveHint["priority"]): MoveHint {
  return {
    index: 12,
    coordinate: { x: 2, y: 2, z: 0 },
    score: 100,
    priority
  };
}

function createStateFixture(params?: {
  turn?: PlayerMark;
  winner?: Winner;
  hints?: MoveHint[];
  assistEnabled?: boolean;
  hasPendingMove?: boolean;
  canContinueMatch?: boolean;
  continueMatchReason?: "opponentOffline" | "readyTimeout";
  continueSubmitting?: boolean;
  myRematchReady?: boolean;
  opponentRematchReady?: boolean;
  connectionStatus?: "connecting" | "online" | "reconnecting" | "offline";
  canObserveBoard?: boolean;
}) {
  return createSmartActionState({
    snapshot: {
      turn: params?.turn ?? "X",
      winner: params?.winner ?? null
    },
    myMark: "X",
    hints: params?.hints ?? [createHint("best")],
    assistEnabled: params?.assistEnabled ?? true,
    hasPendingMove: params?.hasPendingMove ?? false,
    canContinueMatch: params?.canContinueMatch ?? false,
    continueMatchReason: params?.continueMatchReason ?? null,
    continueSubmitting: params?.continueSubmitting ?? false,
    myRematchReady: params?.myRematchReady ?? false,
    opponentRematchReady: params?.opponentRematchReady ?? false,
    connectionStatus: params?.connectionStatus ?? "online",
    canObserveBoard: params?.canObserveBoard ?? true
  });
}

describe("createSmartActionState", () => {
  it("returns winning action when immediate win exists", () => {
    const state = createStateFixture({
      hints: [createHint("win")]
    });

    expect(state.actionType).toBe("win");
    expect(state.label).toBe("一键制胜");
    expect(state.enabled).toBe(true);
    expect(state.target).toEqual({ x: 2, y: 2, z: 0 });
  });

  it("returns blocking action when defense is required", () => {
    const state = createStateFixture({
      hints: [createHint("block")]
    });

    expect(state.actionType).toBe("block");
    expect(state.label).toBe("一键防守");
    expect(state.enabled).toBe(true);
  });

  it("returns suggested action in normal turn", () => {
    const state = createStateFixture({
      hints: [createHint("best")]
    });

    expect(state.actionType).toBe("suggest");
    expect(state.label).toBe("按建议落子");
    expect(state.enabled).toBe(true);
  });

  it("returns enable-assist action when assist is disabled on my turn", () => {
    const state = createStateFixture({
      assistEnabled: false,
      hints: [createHint("win")]
    });

    expect(state.actionType).toBe("enableAssist");
    expect(state.enabled).toBe(true);
    expect(state.target).toBeNull();
    expect(state.label).toContain("开启提示");
  });

  it("returns waiting action when not my turn", () => {
    const state = createStateFixture({
      turn: "O"
    });

    expect(state.actionType).toBe("wait");
    expect(state.label).toBe("等待对手");
    expect(state.enabled).toBe(false);
    expect(state.reason).toContain("切层观察");
  });

  it("still returns wait when assist is disabled but not my turn", () => {
    const state = createStateFixture({
      assistEnabled: false,
      turn: "O"
    });

    expect(state.actionType).toBe("wait");
    expect(state.enabled).toBe(false);
  });

  it("disables action while a move is pending confirmation", () => {
    const state = createStateFixture({
      hasPendingMove: true,
      hints: [createHint("win")]
    });

    expect(state.actionType).toBe("pending");
    expect(state.enabled).toBe(false);
    expect(state.label).toBe("提交中...");
    expect(state.reason).toContain("切层观察");
  });

  it("returns rematch action when game ended", () => {
    const state = createStateFixture({
      winner: "X"
    });

    expect(state.actionType).toBe("rematch");
    expect(state.label).toBe("再来一局");
    expect(state.enabled).toBe(true);
  });

  it("returns continue match action when settlement supports quick continuation", () => {
    const state = createStateFixture({
      winner: "X",
      canContinueMatch: true,
      continueMatchReason: "opponentOffline"
    });

    expect(state.actionType).toBe("continueMatch");
    expect(state.label).toBe("继续匹配");
    expect(state.enabled).toBe(true);
    expect(state.reason).toContain("掉线");
  });

  it("uses timeout-specific reason when ready-check waiting is fused off", () => {
    const state = createStateFixture({
      winner: "draw",
      canContinueMatch: true,
      continueMatchReason: "readyTimeout"
    });

    expect(state.actionType).toBe("continueMatch");
    expect(state.reason).toContain("超时");
  });

  it("shows continue submitting state while switching queue", () => {
    const state = createStateFixture({
      winner: "X",
      continueSubmitting: true
    });

    expect(state.actionType).toBe("continuePending");
    expect(state.enabled).toBe(false);
    expect(state.reason).toContain("切换");
  });

  it("returns waiting-ready action when I already confirmed rematch", () => {
    const state = createStateFixture({
      winner: "O",
      myRematchReady: true
    });

    expect(state.actionType).toBe("readyWaiting");
    expect(state.label).toBe("已准备，等待对手");
    expect(state.enabled).toBe(false);
  });

  it("returns opponent-ready action when opponent is waiting my confirm", () => {
    const state = createStateFixture({
      winner: "draw",
      opponentRematchReady: true
    });

    expect(state.actionType).toBe("opponentReady");
    expect(state.label).toBe("对手已准备，点击开始");
    expect(state.enabled).toBe(true);
  });

  it("shows countdown-like waiting state when both sides are ready", () => {
    const state = createStateFixture({
      winner: "X",
      myRematchReady: true,
      opponentRematchReady: true
    });

    expect(state.actionType).toBe("readyWaiting");
    expect(state.label).toBe("即将开始下一局");
    expect(state.enabled).toBe(false);
  });

  it("disables action when connection is not online", () => {
    const state = createStateFixture({
      connectionStatus: "reconnecting",
      hints: [createHint("win")],
      canObserveBoard: true
    });

    expect(state.actionType).toBe("connection");
    expect(state.label).toBe("重连中");
    expect(state.enabled).toBe(false);
    expect(state.reason).toContain("重连");
    expect(state.reason).toContain("切层观察");
  });

  it("omits observation hint when reconnecting and board is not observable", () => {
    const state = createStateFixture({
      connectionStatus: "reconnecting",
      canObserveBoard: false
    });

    expect(state.actionType).toBe("connection");
    expect(state.label).toBe("重连中");
    expect(state.reason).toBe("网络重连中，请稍候");
  });

  it("keeps actionable observation hint when offline", () => {
    const state = createStateFixture({
      connectionStatus: "offline",
      canObserveBoard: true
    });

    expect(state.actionType).toBe("connection");
    expect(state.label).toBe("离线中");
    expect(state.enabled).toBe(false);
    expect(state.reason).toContain("离线");
    expect(state.reason).toContain("切层观察");
  });

  it("omits observation hint when offline and board is not observable", () => {
    const state = createStateFixture({
      connectionStatus: "offline",
      canObserveBoard: false
    });

    expect(state.actionType).toBe("connection");
    expect(state.label).toBe("离线中");
    expect(state.reason).toBe("当前离线，暂不可操作");
  });

  it("keeps neutral connection hint while connecting", () => {
    const state = createStateFixture({
      connectionStatus: "connecting",
      canObserveBoard: false
    });

    expect(state.actionType).toBe("connection");
    expect(state.label).toBe("连接中");
    expect(state.reason).toBe("正在连接服务器");
  });
});
