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
  connectionStatus?: "connecting" | "online" | "reconnecting" | "offline";
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
    connectionStatus: params?.connectionStatus ?? "online"
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

  it("returns waiting action when not my turn", () => {
    const state = createStateFixture({
      turn: "O"
    });

    expect(state.actionType).toBe("wait");
    expect(state.label).toBe("等待对手");
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
  });

  it("returns rematch action when game ended", () => {
    const state = createStateFixture({
      winner: "X"
    });

    expect(state.actionType).toBe("rematch");
    expect(state.label).toBe("再来一局");
    expect(state.enabled).toBe(true);
  });

  it("disables action when connection is not online", () => {
    const state = createStateFixture({
      connectionStatus: "reconnecting",
      hints: [createHint("win")]
    });

    expect(state.actionType).toBe("connection");
    expect(state.enabled).toBe(false);
    expect(state.reason).toContain("重连");
  });
});
