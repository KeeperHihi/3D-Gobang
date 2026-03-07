import type { AutoContinueAfterFallbackPhase } from "./autoContinueAfterFallback";
import type { AutoRematchPhase } from "./autoRematch";
import type { ConnectionStatus } from "./smartAction";
import type { TimeoutAssistUrgency } from "./timeoutAssist";
import type { TurnNudgePermissionPhase } from "./turnNudgePermission";

export type HudSpotlightCardId =
  | "connection"
  | "reconnect"
  | "turn-clock"
  | "timeout-assist"
  | "win-line"
  | "auto-rematch"
  | "auto-continue"
  | "rematch-wait"
  | "ready-check"
  | "turn-nudge-prompt"
  | "turn-nudge-denied"
  | "onboarding";

export type HudSpotlightTone = "critical" | "action" | "info";

export interface HudSpotlightInput {
  connectionStatus: ConnectionStatus;
  showReconnectDeadline: boolean;
  reconnectUrgent: boolean;
  showTurnCountdown: boolean;
  turnUrgent: boolean;
  showTimeoutAssistHint: boolean;
  timeoutAssistUrgency: TimeoutAssistUrgency;
  showWinLineSummary: boolean;
  winLineCinematicActive: boolean;
  showAutoRematchHint: boolean;
  autoRematchPhase: AutoRematchPhase;
  showAutoContinueHint: boolean;
  autoContinuePhase: AutoContinueAfterFallbackPhase;
  showRematchWaitHint: boolean;
  showRematchReadyCheck: boolean;
  turnNudgePermissionPhase: TurnNudgePermissionPhase;
  onboardingVisible: boolean;
  maxSecondaryItems?: number;
}

export interface HudSpotlightCard {
  id: HudSpotlightCardId;
  tone: HudSpotlightTone;
}

export interface HudSpotlightDecision {
  primaryCard: HudSpotlightCard | null;
  secondaryItems: HudSpotlightCard[];
}

interface Candidate {
  id: HudSpotlightCardId;
  tone: HudSpotlightTone;
  priority: number;
}

function priorityForTimeoutAssist(urgency: TimeoutAssistUrgency): number {
  if (urgency === "armed") {
    return 72;
  }
  if (urgency === "triggered") {
    return 58;
  }
  if (urgency === "idle") {
    return 52;
  }
  return 0;
}

function priorityForAutoRematch(phase: AutoRematchPhase): number {
  if (phase === "countdown") {
    return 68;
  }
  if (phase === "armed") {
    return 62;
  }
  if (phase === "cancelled") {
    return 50;
  }
  return 54;
}

function priorityForAutoContinue(phase: AutoContinueAfterFallbackPhase): number {
  if (phase === "countdown") {
    return 82;
  }
  if (phase === "armed") {
    return 76;
  }
  if (phase === "cancelled") {
    return 56;
  }
  return 60;
}

function createCandidates(input: HudSpotlightInput): Candidate[] {
  const candidates: Candidate[] = [];
  const push = (candidate: Candidate | null) => {
    if (candidate !== null) {
      candidates.push(candidate);
    }
  };

  push(
    input.connectionStatus === "online"
      ? null
      : {
          id: "connection",
          tone: "critical",
          priority: 100
        }
  );

  push(
    input.showReconnectDeadline
      ? {
          id: "reconnect",
          tone: "critical",
          priority: input.reconnectUrgent ? 95 : 88
        }
      : null
  );

  push(
    input.showTurnCountdown
      ? {
          id: "turn-clock",
          tone: input.turnUrgent ? "critical" : "info",
          priority: input.turnUrgent ? 90 : 52
        }
      : null
  );

  push(
    input.showTimeoutAssistHint
      ? {
          id: "timeout-assist",
          tone: input.timeoutAssistUrgency === "armed" ? "critical" : "info",
          priority: priorityForTimeoutAssist(input.timeoutAssistUrgency)
        }
      : null
  );

  push(
    input.showWinLineSummary
      ? {
          id: "win-line",
          tone: "action",
          priority: input.winLineCinematicActive ? 78 : 70
        }
      : null
  );

  push(
    input.showAutoContinueHint
      ? {
          id: "auto-continue",
          tone: "action",
          priority: priorityForAutoContinue(input.autoContinuePhase)
        }
      : null
  );

  push(
    input.showRematchWaitHint
      ? {
          id: "rematch-wait",
          tone: "action",
          priority: 74
        }
      : null
  );

  push(
    input.showAutoRematchHint
      ? {
          id: "auto-rematch",
          tone: "action",
          priority: priorityForAutoRematch(input.autoRematchPhase)
        }
      : null
  );

  push(
    input.showRematchReadyCheck
      ? {
          id: "ready-check",
          tone: "info",
          priority: 46
        }
      : null
  );

  push(
    input.turnNudgePermissionPhase === "prompt"
      ? {
          id: "turn-nudge-prompt",
          tone: "action",
          priority: 60
        }
      : null
  );

  push(
    input.turnNudgePermissionPhase === "denied"
      ? {
          id: "turn-nudge-denied",
          tone: "info",
          priority: 58
        }
      : null
  );

  push(
    input.onboardingVisible
      ? {
          id: "onboarding",
          tone: "action",
          priority: 64
        }
      : null
  );

  return candidates;
}

export function evaluateHudSpotlight(input: HudSpotlightInput): HudSpotlightDecision {
  const maxSecondaryItems = Math.max(0, input.maxSecondaryItems ?? 2);
  const sorted = createCandidates(input)
    .filter((item) => item.priority > 0)
    .sort((left, right) => right.priority - left.priority);

  if (sorted.length === 0) {
    return {
      primaryCard: null,
      secondaryItems: []
    };
  }

  const primaryCard: HudSpotlightCard = {
    id: sorted[0].id,
    tone: sorted[0].tone
  };
  const secondaryItems: HudSpotlightCard[] = sorted.slice(1, 1 + maxSecondaryItems).map((item) => ({
    id: item.id,
    tone: item.tone
  }));

  return {
    primaryCard,
    secondaryItems
  };
}
