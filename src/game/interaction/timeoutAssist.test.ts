import { describe, expect, it } from "vitest";
import { createTimeoutAssistTurnKey, evaluateTimeoutAssist } from "./timeoutAssist";

function createDecision(overrides?: Partial<Parameters<typeof evaluateTimeoutAssist>[0]>) {
  return evaluateTimeoutAssist({
    enabled: true,
    turnRemainingMs: 2_200,
    canPlace: true,
    hasPendingMove: false,
    alreadyTriggeredThisTurn: false,
    smartAction: {
      actionType: "suggest",
      enabled: true,
      target: { x: 1, y: 1, z: 1 }
    },
    ...overrides
  });
}

describe("evaluateTimeoutAssist", () => {
  it("triggers auto action when entering critical time window", () => {
    const decision = createDecision({
      turnRemainingMs: 2_400
    });

    expect(decision.shouldAutoAct).toBe(true);
    expect(decision.nextAction).toBe("autoAct");
    expect(decision.autoActSource).toBe("smartAction");
    expect(decision.urgencyLabel).toBe("armed");
  });

  it("does not trigger when not in my actionable turn context", () => {
    const decision = createDecision({
      canPlace: false
    });

    expect(decision.shouldAutoAct).toBe(false);
    expect(decision.nextAction).toBe("none");
    expect(decision.autoActSource).toBe("none");
    expect(decision.urgencyLabel).toBe("idle");
  });

  it("does not trigger when action is disabled or missing target", () => {
    const disabledAction = createDecision({
      smartAction: {
        actionType: "suggest",
        enabled: false,
        target: { x: 1, y: 1, z: 1 }
      }
    });
    const missingTarget = createDecision({
      smartAction: {
        actionType: "suggest",
        enabled: true,
        target: null
      }
    });
    const nonAutoAction = createDecision({
      smartAction: {
        actionType: "manual",
        enabled: true,
        target: null
      }
    });

    expect(disabledAction.shouldAutoAct).toBe(false);
    expect(disabledAction.nextAction).toBe("none");
    expect(disabledAction.autoActSource).toBe("none");
    expect(missingTarget.shouldAutoAct).toBe(false);
    expect(missingTarget.nextAction).toBe("none");
    expect(missingTarget.autoActSource).toBe("none");
    expect(nonAutoAction.shouldAutoAct).toBe(false);
    expect(nonAutoAction.nextAction).toBe("none");
    expect(nonAutoAction.autoActSource).toBe("none");
  });

  it("does not trigger when pending move already exists", () => {
    const decision = createDecision({
      hasPendingMove: true
    });

    expect(decision.shouldAutoAct).toBe(false);
    expect(decision.nextAction).toBe("none");
    expect(decision.autoActSource).toBe("none");
    expect(decision.urgencyLabel).toBe("idle");
  });

  it("does not trigger repeatedly in the same turn", () => {
    const decision = createDecision({
      alreadyTriggeredThisTurn: true
    });

    expect(decision.shouldAutoAct).toBe(false);
    expect(decision.nextAction).toBe("none");
    expect(decision.autoActSource).toBe("none");
    expect(decision.urgencyLabel).toBe("triggered");
  });

  it("respects user disable switch", () => {
    const decision = createDecision({
      enabled: false
    });

    expect(decision.shouldAutoAct).toBe(false);
    expect(decision.nextAction).toBe("none");
    expect(decision.autoActSource).toBe("none");
    expect(decision.urgencyLabel).toBe("off");
  });

  it("supports adaptive threshold overrides", () => {
    const remainsAt2300WithStrictThreshold = createDecision({
      turnRemainingMs: 2_300,
      thresholdMs: 2_200
    });
    const remainsAt2300WithLooseThreshold = createDecision({
      turnRemainingMs: 2_300,
      thresholdMs: 2_800
    });

    expect(remainsAt2300WithStrictThreshold.shouldAutoAct).toBe(false);
    expect(remainsAt2300WithStrictThreshold.nextAction).toBe("none");
    expect(remainsAt2300WithStrictThreshold.autoActSource).toBe("none");
    expect(remainsAt2300WithLooseThreshold.shouldAutoAct).toBe(true);
    expect(remainsAt2300WithLooseThreshold.nextAction).toBe("autoAct");
    expect(remainsAt2300WithLooseThreshold.autoActSource).toBe("smartAction");
  });

  it("falls back to emergency target when smart action cannot auto-act", () => {
    const decision = createDecision({
      smartAction: {
        actionType: "enableAssist",
        enabled: true,
        target: null
      },
      fallbackTarget: {
        x: 5,
        y: 3,
        z: 4
      }
    });

    expect(decision.shouldAutoAct).toBe(true);
    expect(decision.nextAction).toBe("autoAct");
    expect(decision.autoActSource).toBe("fallbackTarget");
    expect(decision.urgencyLabel).toBe("armed");
  });

  it("does not use fallback target before threshold", () => {
    const decision = createDecision({
      smartAction: {
        actionType: "enableAssist",
        enabled: true,
        target: null
      },
      fallbackTarget: {
        x: 5,
        y: 3,
        z: 4
      },
      turnRemainingMs: 3_200
    });

    expect(decision.shouldAutoAct).toBe(false);
    expect(decision.nextAction).toBe("none");
    expect(decision.autoActSource).toBe("none");
    expect(decision.urgencyLabel).toBe("idle");
  });

  it("prioritizes smart action target over fallback target", () => {
    const decision = createDecision({
      fallbackTarget: {
        x: 7,
        y: 7,
        z: 7
      },
      smartAction: {
        actionType: "win",
        enabled: true,
        target: {
          x: 0,
          y: 0,
          z: 0
        }
      }
    });

    expect(decision.shouldAutoAct).toBe(true);
    expect(decision.nextAction).toBe("autoAct");
    expect(decision.autoActSource).toBe("smartAction");
  });
});

describe("createTimeoutAssistTurnKey", () => {
  it("keeps same key within same turn snapshot", () => {
    const keyA = createTimeoutAssistTurnKey({
      roomId: "room-1",
      turn: "X",
      lastMoveNumber: 8,
      turnDeadlineAt: 20_000
    });
    const keyB = createTimeoutAssistTurnKey({
      roomId: "room-1",
      turn: "X",
      lastMoveNumber: 8,
      turnDeadlineAt: 20_000
    });

    expect(keyA).toBe(keyB);
  });

  it("changes key when new round restarts with same room and turn", () => {
    const previousRoundKey = createTimeoutAssistTurnKey({
      roomId: "room-1",
      turn: "X",
      lastMoveNumber: null,
      turnDeadlineAt: 31_000
    });
    const rematchRoundKey = createTimeoutAssistTurnKey({
      roomId: "room-1",
      turn: "X",
      lastMoveNumber: null,
      turnDeadlineAt: 55_000
    });

    expect(previousRoundKey).not.toBe(rematchRoundKey);
  });
});
