export type LayerFocusCueSource =
  | "tap-focus"
  | "wheel"
  | "swipe"
  | "button"
  | "smart-jump"
  | "auto";

export type LayerFocusCueBlockReason =
  | "opponent-turn"
  | "offline"
  | "pending"
  | "winner"
  | "unknown";

export interface LayerFocusCueInput {
  source: LayerFocusCueSource;
  fromLayer: number;
  toLayer: number;
  canPlaceNow: boolean;
  blockReason: LayerFocusCueBlockReason;
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

function resolveBlockedMessage(reason: LayerFocusCueBlockReason): string {
  if (reason === "opponent-turn") {
    return "当前是对手回合";
  }
  if (reason === "offline") {
    return "网络恢复后可继续落子";
  }
  if (reason === "pending") {
    return "正在提交上一步落子";
  }
  if (reason === "winner") {
    return "本局已结束";
  }
  return "当前暂不可落子";
}

function createLayerFocusCueMessage(
  targetLayer: number,
  canPlaceNow: boolean,
  blockReason: LayerFocusCueBlockReason
): string {
  const layerLabel = `已切到 L${targetLayer + 1}`;
  if (canPlaceNow) {
    return `${layerLabel}，再次点击空位即可落子`;
  }
  return `${layerLabel}，${resolveBlockedMessage(blockReason)}`;
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
    message: createLayerFocusCueMessage(input.toLayer, input.canPlaceNow, input.blockReason),
    shownAtMs: input.nowMs,
    expiresAtMs: input.nowMs + durationMs
  };
}
