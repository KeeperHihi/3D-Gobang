import { fromLinearIndex } from "../engine/board";
import type { Coordinate3D } from "../../network/protocol";

export interface BoardInstanceHintMeta {
  rank: number;
  color: string;
}

export interface BoardInstanceStyle {
  color: string;
  emissive: string;
  emissiveIntensity: number;
  opacity: number;
  scale: number;
  interactive: boolean;
}

export interface BoardInstanceEntry {
  boardIndex: number;
  coordinate: Coordinate3D;
}

export interface BoardInstanceBucket {
  id: string;
  style: BoardInstanceStyle;
  instances: BoardInstanceEntry[];
}

export interface BoardIndexInstanceLookup {
  bucketId: string;
  instanceId: number;
}

export interface BoardInstanceLayout {
  buckets: BoardInstanceBucket[];
  indexToInstance: Map<number, BoardIndexInstanceLookup>;
  totalInstances: number;
}

export interface BuildBoardInstanceLayoutInput {
  board: number[];
  size: number;
  canPlace: boolean;
  focusLayer: number | null;
  nonFocusLayerOpacity: number;
  emptyCellOpacityScale: number;
  winningIndexes: ReadonlySet<number>;
  hintMap: ReadonlyMap<number, BoardInstanceHintMeta>;
  winLineCinematicActive: boolean;
}

function normalizeOpacity(value: number): number {
  return Number(value.toFixed(4));
}

function createStyleKey(style: BoardInstanceStyle): string {
  return [
    style.color,
    style.emissive,
    style.emissiveIntensity.toFixed(4),
    style.opacity.toFixed(4),
    style.scale.toFixed(3),
    style.interactive ? "1" : "0"
  ].join("|");
}

export function buildBoardInstanceLayout(input: BuildBoardInstanceLayoutInput): BoardInstanceLayout {
  const bucketsByKey = new Map<string, BoardInstanceBucket>();
  const indexToInstance = new Map<number, BoardIndexInstanceLookup>();
  const otherLayerOpacity = Math.max(0.02, Math.min(1, input.nonFocusLayerOpacity));

  for (let index = 0; index < input.board.length; index += 1) {
    const value = input.board[index] ?? 0;
    const coordinate = fromLinearIndex(index, input.size);
    const isWinningCell = input.winningIndexes.has(index);
    const isEmpty = value === 0;
    const inFocusLayer = input.focusLayer === null || coordinate.z === input.focusLayer;
    const interactive = input.canPlace && isEmpty && inFocusLayer;
    const hint = isEmpty ? input.hintMap.get(index) : undefined;
    const layerOpacityFactor =
      input.focusLayer === null || inFocusLayer || !isEmpty ? 1 : otherLayerOpacity;
    const color = value === 1 ? "#64f6ff" : value === 2 ? "#ff69d0" : "#182850";
    const emissiveBaseColor = value === 1 ? "#48ffff" : value === 2 ? "#ff52da" : "#4f8eff";
    const emissive = hint?.color ?? emissiveBaseColor;
    const opacityBase = isEmpty ? 0.24 * input.emptyCellOpacityScale : 0.93;
    const opacity = normalizeOpacity(opacityBase * layerOpacityFactor);
    const emissiveIntensityBase = isWinningCell
      ? input.winLineCinematicActive
        ? 2.9
        : 2.3
      : hint
        ? hint.rank === 0
          ? 2.05
          : 1.35
        : value === 0
          ? 0.4
          : 0.9;
    const emissiveIntensity = normalizeOpacity(emissiveIntensityBase * (inFocusLayer ? 1 : 0.5));
    const scale = hint?.rank === 0 ? 1.16 : 1;

    const style: BoardInstanceStyle = {
      color,
      emissive,
      emissiveIntensity,
      opacity,
      scale,
      interactive
    };
    const styleKey = createStyleKey(style);
    let bucket = bucketsByKey.get(styleKey);
    if (!bucket) {
      bucket = {
        id: `bucket:${styleKey}`,
        style,
        instances: []
      };
      bucketsByKey.set(styleKey, bucket);
    }

    const nextInstanceId = bucket.instances.length;
    bucket.instances.push({
      boardIndex: index,
      coordinate
    });
    indexToInstance.set(index, {
      bucketId: bucket.id,
      instanceId: nextInstanceId
    });
  }

  return {
    buckets: Array.from(bucketsByKey.values()),
    indexToInstance,
    totalInstances: input.board.length
  };
}

export function resolveBoardInstanceCell(
  bucket: BoardInstanceBucket,
  instanceId: number | undefined
): BoardInstanceEntry | null {
  if (typeof instanceId !== "number" || !Number.isInteger(instanceId)) {
    return null;
  }
  if (instanceId < 0 || instanceId >= bucket.instances.length) {
    return null;
  }
  return bucket.instances[instanceId] ?? null;
}
