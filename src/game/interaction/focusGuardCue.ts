import type { FocusGuardReason } from "./focusGuard";

export interface FocusGuardCueInput {
  reason: FocusGuardReason;
  targetLayer: number;
  nowMs: number;
  lastShownAtMs: number | null;
  cooldownMs?: number;
  durationMs?: number;
}

export interface FocusGuardCueDecision {
  shouldShow: boolean;
  message: string | null;
  shownAtMs: number | null;
  expiresAtMs: number | null;
}

export const FOCUS_GUARD_CUE_COOLDOWN_MS = 1_000;
export const FOCUS_GUARD_CUE_DURATION_MS = 1_200;

function createFocusGuardCueMessage(reason: FocusGuardReason, targetLayer: number): string | null {
  const layerLabel = `L${targetLayer + 1}`;
  if (reason === "turnHandover") {
    return `轮到你了，已切回推荐层 ${layerLabel}`;
  }
  if (reason === "urgent") {
    return `时间紧迫，已自动对焦关键层 ${layerLabel}`;
  }
  return null;
}

export function evaluateFocusGuardCue(input: FocusGuardCueInput): FocusGuardCueDecision {
  const message = createFocusGuardCueMessage(input.reason, input.targetLayer);
  if (!message) {
    return {
      shouldShow: false,
      message: null,
      shownAtMs: null,
      expiresAtMs: null
    };
  }

  const cooldownMs = input.cooldownMs ?? FOCUS_GUARD_CUE_COOLDOWN_MS;
  if (
    input.lastShownAtMs !== null &&
    Math.max(0, input.nowMs - input.lastShownAtMs) < cooldownMs
  ) {
    return {
      shouldShow: false,
      message: null,
      shownAtMs: null,
      expiresAtMs: null
    };
  }

  const durationMs = input.durationMs ?? FOCUS_GUARD_CUE_DURATION_MS;
  return {
    shouldShow: true,
    message,
    shownAtMs: input.nowMs,
    expiresAtMs: input.nowMs + durationMs
  };
}
