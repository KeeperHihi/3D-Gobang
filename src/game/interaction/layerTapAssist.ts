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
  if (!input.inFocusLayer && input.currentLayer !== input.targetLayer) {
    return {
      action: "focus",
      nextFocusLayer: input.targetLayer
    };
  }

  if (input.canPlace && input.isEmpty) {
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
