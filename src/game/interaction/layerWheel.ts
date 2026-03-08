export type LayerWheelDirection = "forward-up" | "forward-down";

export const DEFAULT_LAYER_WHEEL_DIRECTION: LayerWheelDirection = "forward-up";

export function sanitizeLayerWheelDirection(raw: string | null | undefined): LayerWheelDirection {
  return raw === "forward-down" ? "forward-down" : "forward-up";
}

export function resolveLayerStepFromWheelDelta(
  deltaY: number,
  direction: LayerWheelDirection
): -1 | 1 | null {
  if (!Number.isFinite(deltaY) || deltaY === 0) {
    return null;
  }
  const forwardStep: -1 | 1 = direction === "forward-up" ? 1 : -1;
  return deltaY > 0 ? forwardStep : (forwardStep * -1) as -1 | 1;
}
