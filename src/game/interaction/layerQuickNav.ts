import type { MoveRecord } from "../../network/protocol";
import type { MoveHint } from "../engine/moveHints";

export type LayerQuickNavSource = "recommended" | "recent" | "auto" | "current";
export type LayerQuickTagKind = "current" | "recommended" | "recent";

export interface LayerQuickTag {
  layer: number;
  kind: LayerQuickTagKind;
}

export interface LayerQuickNavInput {
  focusLayer: number;
  boardSize: number;
  hintMoves: MoveHint[];
  lastMove: MoveRecord | null;
  autoFocusLayer: number;
}

export interface LayerQuickNavDecision {
  currentLayer: number;
  prevLayer: number | null;
  nextLayer: number | null;
  canGoPrev: boolean;
  canGoNext: boolean;
  recommendedLayer: number | null;
  recentLayer: number | null;
  smartJumpLayer: number;
  smartJumpSource: LayerQuickNavSource;
  keyTags: LayerQuickTag[];
}

function clampLayer(layer: number, boardSize: number): number {
  return Math.max(0, Math.min(boardSize - 1, layer));
}

function resolveSmartJumpTarget(
  currentLayer: number,
  recommendedLayer: number | null,
  recentLayer: number | null,
  autoFocusLayer: number,
  boardSize: number
): { layer: number; source: LayerQuickNavSource } {
  const autoLayer = clampLayer(autoFocusLayer, boardSize);
  const candidates: Array<{ layer: number | null; source: LayerQuickNavSource }> = [
    { layer: recommendedLayer, source: "recommended" },
    { layer: recentLayer, source: "recent" },
    { layer: autoLayer, source: "auto" }
  ];

  for (const candidate of candidates) {
    if (candidate.layer === null) {
      continue;
    }
    const clampedLayer = clampLayer(candidate.layer, boardSize);
    if (clampedLayer !== currentLayer) {
      return {
        layer: clampedLayer,
        source: candidate.source
      };
    }
  }

  return {
    layer: currentLayer,
    source: "current"
  };
}

function resolveKeyTags(
  currentLayer: number,
  recommendedLayer: number | null,
  recentLayer: number | null
): LayerQuickTag[] {
  const tags: LayerQuickTag[] = [{ layer: currentLayer, kind: "current" }];
  if (recommendedLayer !== null && recommendedLayer !== currentLayer) {
    tags.push({ layer: recommendedLayer, kind: "recommended" });
  }
  if (recentLayer !== null && recentLayer !== currentLayer && recentLayer !== recommendedLayer) {
    tags.push({ layer: recentLayer, kind: "recent" });
  }
  return tags;
}

export function evaluateLayerQuickNav(input: LayerQuickNavInput): LayerQuickNavDecision {
  const currentLayer = clampLayer(input.focusLayer, input.boardSize);
  const recommendedLayer =
    input.hintMoves.length > 0 ? clampLayer(input.hintMoves[0].coordinate.z, input.boardSize) : null;
  const recentLayer = input.lastMove ? clampLayer(input.lastMove.z, input.boardSize) : null;
  const smartJump = resolveSmartJumpTarget(
    currentLayer,
    recommendedLayer,
    recentLayer,
    input.autoFocusLayer,
    input.boardSize
  );

  return {
    currentLayer,
    prevLayer: currentLayer > 0 ? currentLayer - 1 : null,
    nextLayer: currentLayer < input.boardSize - 1 ? currentLayer + 1 : null,
    canGoPrev: currentLayer > 0,
    canGoNext: currentLayer < input.boardSize - 1,
    recommendedLayer,
    recentLayer,
    smartJumpLayer: smartJump.layer,
    smartJumpSource: smartJump.source,
    keyTags: resolveKeyTags(currentLayer, recommendedLayer, recentLayer)
  };
}
