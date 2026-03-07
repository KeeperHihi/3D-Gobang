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
  it("takes over primary action when lock is confirmable", () => {
    const state = createPrimaryIntentState({
      smartAction: createSmartAction({
        actionType: "win",
        label: "一键制胜",
        target: { x: 0, y: 0, z: 0 }
      }),
      layerTapLockDecision: {
        canConfirm: true,
        lock: {
          coordinate: { x: 4, y: 3, z: 2 },
          expiresAtMs: 20_000
        }
      },
      focusLayer: 2
    });

    expect(state.source).toBe("tap-lock");
    expect(state.label).toBe("确认落子");
    expect(state.enabled).toBe(true);
    expect(state.target).toEqual({ x: 4, y: 3, z: 2 });
    expect(state.reason).toContain("主按钮或空格");
  });

  it("falls back to smart action when lock is not confirmable", () => {
    const smartAction = createSmartAction({
      actionType: "manual",
      enabled: false,
      target: null
    });
    const state = createPrimaryIntentState({
      smartAction,
      layerTapLockDecision: {
        canConfirm: false,
        lock: null
      },
      focusLayer: 1
    });

    expect(state.source).toBe("smart-action");
    expect(state.actionType).toBe("manual");
    expect(state.enabled).toBe(false);
    expect(state.target).toBeNull();
    expect(state.label).toBe("按建议落子");
  });

  it("keeps tap-lock priority even when smart action is disabled", () => {
    const state = createPrimaryIntentState({
      smartAction: createSmartAction({
        actionType: "manual",
        enabled: false,
        label: "请在棋盘落子",
        target: null
      }),
      layerTapLockDecision: {
        canConfirm: true,
        lock: {
          coordinate: { x: 1, y: 1, z: 4 },
          expiresAtMs: 18_000
        }
      },
      focusLayer: 4
    });

    expect(state.source).toBe("tap-lock");
    expect(state.enabled).toBe(true);
    expect(state.label).toBe("确认落子");
    expect(state.target).toEqual({ x: 1, y: 1, z: 4 });
  });

  it("falls back when lock is confirmable but not visible in current layer", () => {
    const fallbackAction = createSmartAction({
      actionType: "block",
      label: "一键防守",
      target: { x: 2, y: 2, z: 1 }
    });
    const state = createPrimaryIntentState({
      smartAction: fallbackAction,
      layerTapLockDecision: {
        canConfirm: true,
        lock: {
          coordinate: { x: 3, y: 3, z: 4 },
          expiresAtMs: 30_000
        }
      },
      focusLayer: 1
    });

    expect(state.source).toBe("smart-action");
    expect(state.actionType).toBe("block");
    expect(state.label).toBe("一键防守");
    expect(state.target).toEqual({ x: 2, y: 2, z: 1 });
  });

  it("treats lock as visible when focus layer is null", () => {
    const state = createPrimaryIntentState({
      smartAction: createSmartAction({
        actionType: "manual",
        enabled: false,
        target: null
      }),
      layerTapLockDecision: {
        canConfirm: true,
        lock: {
          coordinate: { x: 0, y: 0, z: 2 },
          expiresAtMs: 10_000
        }
      },
      focusLayer: null
    });

    expect(state.source).toBe("tap-lock");
    expect(state.target).toEqual({ x: 0, y: 0, z: 2 });
  });
});
