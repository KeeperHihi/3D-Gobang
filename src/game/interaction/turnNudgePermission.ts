export type TurnNudgeNotificationPermission = NotificationPermission | "unsupported";
export type TurnNudgePermissionPhase = "hidden" | "prompt" | "denied" | "granted" | "unsupported";

export interface TurnNudgePermissionInput {
  enabled: boolean;
  permission: TurnNudgeNotificationPermission;
  snoozedUntilMs: number | null;
  requestPending: boolean;
  lastRequestedAtMs: number | null;
  nowMs: number;
  requestCooldownMs?: number;
}

export interface TurnNudgePermissionDecision {
  phase: TurnNudgePermissionPhase;
  showCta: boolean;
  showDeniedHint: boolean;
  showInlinePrompt: boolean;
  canRequest: boolean;
}

export const TURN_NUDGE_PERMISSION_REQUEST_COOLDOWN_MS = 2_000;
export const TURN_NUDGE_PERMISSION_SNOOZE_MS = 24 * 60 * 60 * 1000;

export function evaluateTurnNudgePermission(
  input: TurnNudgePermissionInput
): TurnNudgePermissionDecision {
  if (!input.enabled) {
    return {
      phase: "hidden",
      showCta: false,
      showDeniedHint: false,
      showInlinePrompt: false,
      canRequest: false
    };
  }

  const snoozed = input.snoozedUntilMs !== null && input.nowMs < input.snoozedUntilMs;

  if (snoozed) {
    return {
      phase: "hidden",
      showCta: false,
      showDeniedHint: false,
      showInlinePrompt: false,
      canRequest: false
    };
  }

  if (input.permission === "unsupported") {
    return {
      phase: "unsupported",
      showCta: false,
      showDeniedHint: false,
      showInlinePrompt: false,
      canRequest: false
    };
  }

  if (input.permission === "granted") {
    return {
      phase: "granted",
      showCta: false,
      showDeniedHint: false,
      showInlinePrompt: false,
      canRequest: false
    };
  }

  if (input.permission === "denied") {
    return {
      phase: "denied",
      showCta: false,
      showDeniedHint: true,
      showInlinePrompt: true,
      canRequest: false
    };
  }

  const cooldownMs = input.requestCooldownMs ?? TURN_NUDGE_PERMISSION_REQUEST_COOLDOWN_MS;
  const inCooldown =
    input.lastRequestedAtMs !== null && Math.max(0, input.nowMs - input.lastRequestedAtMs) < cooldownMs;

  return {
    phase: "prompt",
    showCta: true,
    showDeniedHint: false,
    showInlinePrompt: true,
    canRequest: !input.requestPending && !inCooldown
  };
}
