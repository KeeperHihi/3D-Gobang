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
