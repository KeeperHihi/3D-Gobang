import type { FocusGuardCueDecision } from "./focusGuardCue";
import type { LayerFocusCueDecision } from "./layerFocusCue";

export type InteractionCueKind = "focus-guard" | "tap-focus";

export type InteractionCueTone = "focus-guard-cue" | "focus-cue";

export interface InteractionCue {
  kind: InteractionCueKind;
  tone: InteractionCueTone;
  message: string;
  priority: number;
  shownAtMs: number;
  expiresAtMs: number;
}

interface InteractionCueSpec {
  tone: InteractionCueTone;
  priority: number;
}

interface InteractionCueDecisionLike {
  shouldShow: boolean;
  message: string | null;
  shownAtMs: number | null;
  expiresAtMs: number | null;
}

const INTERACTION_CUE_SPECS: Record<InteractionCueKind, InteractionCueSpec> = {
  "tap-focus": {
    tone: "focus-cue",
    priority: 40
  },
  "focus-guard": {
    tone: "focus-guard-cue",
    priority: 60
  }
};

export function createInteractionCue(
  kind: InteractionCueKind,
  decision: InteractionCueDecisionLike,
  nowMs: number
): InteractionCue | null {
  if (!decision.shouldShow) {
    return null;
  }

  const spec = INTERACTION_CUE_SPECS[kind];
  return {
    kind,
    tone: spec.tone,
    message: decision.message ?? "",
    priority: spec.priority,
    shownAtMs: decision.shownAtMs ?? nowMs,
    expiresAtMs: decision.expiresAtMs ?? nowMs
  };
}

export function createLayerFocusInteractionCue(
  decision: LayerFocusCueDecision,
  nowMs: number
): InteractionCue | null {
  return createInteractionCue("tap-focus", decision, nowMs);
}

export function createFocusGuardInteractionCue(
  decision: FocusGuardCueDecision,
  nowMs: number
): InteractionCue | null {
  return createInteractionCue("focus-guard", decision, nowMs);
}

export function resolveCueAfterTick(
  currentCue: InteractionCue | null,
  nowMs: number
): InteractionCue | null {
  if (!currentCue) {
    return null;
  }
  if (currentCue.expiresAtMs <= nowMs) {
    return null;
  }
  return currentCue;
}

export function resolveNextCue(
  currentCue: InteractionCue | null,
  incomingCue: InteractionCue | null,
  nowMs: number
): InteractionCue | null {
  const current = resolveCueAfterTick(currentCue, nowMs);
  const incoming = resolveCueAfterTick(incomingCue, nowMs);
  if (!incoming) {
    return current;
  }
  if (!current) {
    return incoming;
  }
  if (incoming.priority > current.priority) {
    return incoming;
  }
  if (incoming.priority < current.priority) {
    return current;
  }
  if (incoming.shownAtMs >= current.shownAtMs) {
    return incoming;
  }
  return current;
}
