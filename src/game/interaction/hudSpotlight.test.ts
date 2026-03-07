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

  it("prioritizes connection failure over every non-critical hint", () => {
    const decision = createDecision({
      connectionStatus: "offline",
      showTurnCountdown: true,
      turnUrgent: true,
      showAutoContinueHint: true,
      autoContinuePhase: "countdown",
      turnNudgePermissionPhase: "prompt"
    });

    expect(decision.primaryCard?.id).toBe("connection");
    expect(decision.secondaryItems.length).toBe(2);
    expect(decision.secondaryItems[0]?.id).toBe("turn-clock");
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
