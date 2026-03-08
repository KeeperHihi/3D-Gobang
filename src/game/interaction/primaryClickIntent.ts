export const QUICK_PRIMARY_CLICK_MAX_DURATION_MS = 220;
export const QUICK_PRIMARY_CLICK_MAX_TRAVEL_PX = 6;

export interface PrimaryClickIntentInput {
  pointerType: string;
  button: number;
  pressDurationMs: number;
  travelDistancePx: number;
}

export function measurePointerTravel(
  startX: number,
  startY: number,
  endX: number,
  endY: number
): number {
  return Math.hypot(endX - startX, endY - startY);
}

export function isQuickPrimaryClick(input: PrimaryClickIntentInput): boolean {
  if (input.pointerType !== "mouse") {
    return true;
  }
  if (input.button !== 0) {
    return false;
  }
  if (!Number.isFinite(input.pressDurationMs) || input.pressDurationMs < 0) {
    return false;
  }
  if (!Number.isFinite(input.travelDistancePx) || input.travelDistancePx < 0) {
    return false;
  }
  if (input.pressDurationMs > QUICK_PRIMARY_CLICK_MAX_DURATION_MS) {
    return false;
  }
  if (input.travelDistancePx > QUICK_PRIMARY_CLICK_MAX_TRAVEL_PX) {
    return false;
  }
  return true;
}
