import { describe, expect, it } from "vitest";
import { evaluateHudSpotlight, type HudSpotlightInput } from "./hudSpotlight";

function createDecision(overrides?: Partial<HudSpotlightInput>) {
  return evaluateHudSpotlight({
    connectionStatus: "online",
    showReconnectDeadline: false,
    reconnectUrgent: false,
    showTurnCountdown: false,
    turnUrgent: false,
    showTimeoutAssistHint: false,
    timeoutAssistUrgency: "idle",
    showWinLineSummary: false,
    winLineCinematicActive: false,
    showAutoRematchHint: false,
    autoRematchPhase: "idle",
    showAutoContinueHint: false,
    autoContinuePhase: "idle",
    showRematchWaitHint: false,
    showRematchReadyCheck: false,
    turnNudgePermissionPhase: "hidden",
    onboardingVisible: false,
    maxSecondaryItems: 2,
    ...overrides
  });
}

describe("evaluateHudSpotlight", () => {
  it("selects auto-continue countdown over win-line as primary", () => {
    const decision = createDecision({
      showWinLineSummary: true,
      winLineCinematicActive: true,
      showAutoContinueHint: true,
      autoContinuePhase: "countdown"
    });

    expect(decision.primaryCard?.id).toBe("auto-continue");
    expect(decision.secondaryItems[0]?.id).toBe("win-line");
  });

  it("keeps urgent turn countdown ahead of permission prompt", () => {
    const decision = createDecision({
      showTurnCountdown: true,
      turnUrgent: true,
      turnNudgePermissionPhase: "prompt"
    });

    expect(decision.primaryCard?.id).toBe("turn-clock");
    expect(decision.secondaryItems[0]?.id).toBe("turn-nudge-prompt");
  });

  it("keeps offline status as top critical spotlight", () => {
    const decision = createDecision({
      connectionStatus: "offline",
      showTurnCountdown: true,
      turnUrgent: true,
      showAutoContinueHint: true,
      autoContinuePhase: "countdown",
      turnNudgePermissionPhase: "prompt"
    });

    expect(decision.primaryCard?.id).toBe("connection");
    expect(decision.primaryCard?.tone).toBe("critical");
    expect(decision.secondaryItems.length).toBe(2);
    expect(decision.secondaryItems[0]?.id).toBe("turn-clock");
  });

  it("does not over-prioritize initial connecting state", () => {
    const decision = createDecision({
      connectionStatus: "connecting",
      showTurnCountdown: true,
      turnUrgent: true,
      showAutoContinueHint: true,
      autoContinuePhase: "countdown"
    });

    expect(decision.primaryCard?.id).toBe("turn-clock");
    expect(decision.secondaryItems[0]?.id).toBe("auto-continue");
    expect(decision.secondaryItems[1]?.id).toBe("connection");
  });

  it("keeps reconnecting state above non-critical hints", () => {
    const decision = createDecision({
      connectionStatus: "reconnecting",
      showAutoContinueHint: true,
      autoContinuePhase: "countdown",
      turnNudgePermissionPhase: "prompt"
    });

    expect(decision.primaryCard?.id).toBe("connection");
    expect(decision.primaryCard?.tone).toBe("critical");
    expect(decision.secondaryItems[0]?.id).toBe("auto-continue");
  });

  it("respects max secondary item cap", () => {
    const decision = createDecision({
      showTurnCountdown: true,
      showTimeoutAssistHint: true,
      showWinLineSummary: true,
      showRematchWaitHint: true,
      maxSecondaryItems: 1
    });

    expect(decision.primaryCard).not.toBeNull();
    expect(decision.secondaryItems.length).toBe(1);
  });

  it("returns empty decision when no status should be shown", () => {
    const decision = createDecision();

    expect(decision.primaryCard).toBeNull();
    expect(decision.secondaryItems).toHaveLength(0);
  });
});
