export type LayerFocusCueSource =
  | "tap-focus"
  | "wheel"
  | "swipe"
  | "button"
  | "smart-jump"
  | "auto";

export interface LayerFocusCueInput {
  source: LayerFocusCueSource;
  fromLayer: number;
  toLayer: number;
  nowMs: number;
  lastShownAtMs: number | null;
  cooldownMs?: number;
  durationMs?: number;
}

export interface LayerFocusCueDecision {
  shouldShow: boolean;
  message: string | null;
  shownAtMs: number | null;
  expiresAtMs: number | null;
}

export const LAYER_FOCUS_CUE_COOLDOWN_MS = 900;
export const LAYER_FOCUS_CUE_DURATION_MS = 1_000;

function createLayerFocusCueMessage(targetLayer: number): string {
  return `已切到 L${targetLayer + 1}，再次点击空位即可落子`;
}

export function evaluateLayerFocusCue(input: LayerFocusCueInput): LayerFocusCueDecision {
  if (input.source !== "tap-focus") {
    return {
      shouldShow: false,
      message: null,
      shownAtMs: null,
      expiresAtMs: null
    };
  }

  if (input.fromLayer === input.toLayer) {
    return {
      shouldShow: false,
      message: null,
      shownAtMs: null,
      expiresAtMs: null
    };
  }

  const cooldownMs = input.cooldownMs ?? LAYER_FOCUS_CUE_COOLDOWN_MS;
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

  const durationMs = input.durationMs ?? LAYER_FOCUS_CUE_DURATION_MS;
  return {
    shouldShow: true,
    message: createLayerFocusCueMessage(input.toLayer),
    shownAtMs: input.nowMs,
    expiresAtMs: input.nowMs + durationMs
  };
}
