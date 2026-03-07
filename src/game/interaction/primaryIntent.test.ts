import { describe, expect, it } from "vitest";
import type { SmartActionState } from "./smartAction";
import { createPrimaryIntentState } from "./primaryIntent";

function createSmartAction(overrides?: Partial<SmartActionState>): SmartActionState {
  return {
    actionType: "suggest",
    label: "按建议落子",
    enabled: true,
    reason: "建议点已高亮，可直接执行",
    target: { x: 2, y: 2, z: 1 },
    ...overrides
  };
}

describe("createPrimaryIntentState", () => {
  it("keeps smart action as the only primary intent source", () => {
    const state = createPrimaryIntentState({
      smartAction: createSmartAction({
        actionType: "win",
        label: "一键制胜",
        target: { x: 0, y: 0, z: 0 }
      })
    });

    expect(state.source).toBe("smart-action");
    expect(state.actionType).toBe("win");
    expect(state.label).toBe("一键制胜");
    expect(state.enabled).toBe(true);
    expect(state.target).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("preserves disabled manual action without rewriting state", () => {
    const manualAction = createSmartAction({
      actionType: "manual",
      enabled: false,
      reason: "暂无建议点，请直接点击棋盘",
      target: null
    });

    const state = createPrimaryIntentState({
      smartAction: manualAction
    });

    expect(state.source).toBe("smart-action");
    expect(state.actionType).toBe("manual");
    expect(state.enabled).toBe(false);
    expect(state.target).toBeNull();
    expect(state.reason).toBe("暂无建议点，请直接点击棋盘");
  });
});
