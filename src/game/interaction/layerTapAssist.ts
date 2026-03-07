export type LayerTapAssistAction = "place" | "focus" | "ignore";

export interface LayerTapAssistInput {
  canPlace: boolean;
  isEmpty: boolean;
  inFocusLayer: boolean;
  targetLayer: number;
  currentLayer: number | null;
}

export interface LayerTapAssistDecision {
  action: LayerTapAssistAction;
  nextFocusLayer: number | null;
}

export function evaluateLayerTapAssist(input: LayerTapAssistInput): LayerTapAssistDecision {
  if (!input.canPlace || !input.isEmpty) {
    return {
      action: "ignore",
      nextFocusLayer: null
    };
  }

  if (input.inFocusLayer || input.currentLayer === input.targetLayer) {
    return {
      action: "place",
      nextFocusLayer: null
    };
  }

  return {
    action: "ignore",
    nextFocusLayer: null
  };
}
