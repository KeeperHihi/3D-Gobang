import type { Coordinate3D } from "../../network/protocol";
import type { LayerTapLockDecision } from "./layerTapLock";
import type { SmartActionState } from "./smartAction";

export type PrimaryIntentSource = "smart-action" | "tap-lock";

export interface PrimaryIntentState extends SmartActionState {
  source: PrimaryIntentSource;
}

interface PrimaryIntentInput {
  smartAction: SmartActionState;
  layerTapLockDecision: Pick<LayerTapLockDecision, "lock" | "canConfirm">;
  focusLayer: number | null;
}

function lockReason(coordinate: Coordinate3D): string {
  return `目标已锁定 L${coordinate.z + 1}（${coordinate.x + 1}, ${coordinate.y + 1}），主按钮或空格即可确认`;
}

export function createPrimaryIntentState(input: PrimaryIntentInput): PrimaryIntentState {
  const { layerTapLockDecision, smartAction, focusLayer } = input;
  const lock = layerTapLockDecision.lock;
  const lockVisible = lock !== null && (focusLayer === null || lock.coordinate.z === focusLayer);
  if (layerTapLockDecision.canConfirm && lockVisible && lock) {
    return {
      actionType: "suggest",
      label: "确认落子",
      enabled: true,
      reason: lockReason(lock.coordinate),
      target: lock.coordinate,
      source: "tap-lock"
    };
  }

  return {
    ...smartAction,
    source: "smart-action"
  };
}
