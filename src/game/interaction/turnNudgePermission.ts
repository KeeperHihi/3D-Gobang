export type TurnNudgeNotificationPermission = NotificationPermission | "unsupported";
export type TurnNudgePermissionPhase = "hidden" | "prompt" | "denied" | "granted" | "unsupported";

export interface TurnNudgePermissionInput {
  enabled: boolean;
  permission: TurnNudgeNotificationPermission;
  dismissed: boolean;
  requestPending: boolean;
  lastRequestedAtMs: number | null;
  nowMs: number;
  requestCooldownMs?: number;
}

export interface TurnNudgePermissionDecision {
  phase: TurnNudgePermissionPhase;
  showCta: boolean;
  showDeniedHint: boolean;
  canRequest: boolean;
}

export const TURN_NUDGE_PERMISSION_REQUEST_COOLDOWN_MS = 2_000;

export function evaluateTurnNudgePermission(
  input: TurnNudgePermissionInput
): TurnNudgePermissionDecision {
  if (!input.enabled || input.dismissed) {
    return {
      phase: "hidden",
      showCta: false,
      showDeniedHint: false,
      canRequest: false
    };
  }

  if (input.permission === "unsupported") {
    return {
      phase: "unsupported",
      showCta: false,
      showDeniedHint: false,
      canRequest: false
    };
  }

  if (input.permission === "granted") {
    return {
      phase: "granted",
      showCta: false,
      showDeniedHint: false,
      canRequest: false
    };
  }

  if (input.permission === "denied") {
    return {
      phase: "denied",
      showCta: false,
      showDeniedHint: true,
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
    canRequest: !input.requestPending && !inCooldown
  };
}
