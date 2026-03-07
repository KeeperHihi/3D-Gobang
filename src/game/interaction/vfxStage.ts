import type { QualityLevel } from "./qualityProfile";
import type { RenderBootstrapPhase } from "./renderBootstrap";

export type BoardSceneVfxStage = "off" | "basic" | "full";

export interface VfxStageInput {
  renderBootstrapPhase: RenderBootstrapPhase;
  averageFps: number | null;
  qualityLevel: QualityLevel;
  sparklesEnabled: boolean;
}

export const VFX_STAGE_OFF_FPS_THRESHOLD = 28;
export const VFX_STAGE_FULL_FPS_THRESHOLD = 46;
export const VFX_STAGE_BASIC_TO_OFF_FPS = 26;
export const VFX_STAGE_OFF_TO_BASIC_FPS = 31;
export const VFX_STAGE_FULL_TO_BASIC_FPS = 43;
export const VFX_STAGE_BASIC_TO_FULL_FPS = 50;
export const VFX_STAGE_HOLD_MS = 2500;
export const VFX_STAGE_EMERGENCY_OFF_FPS = 22;

export interface VfxStageTransitionInput {
  currentStage: BoardSceneVfxStage;
  targetStage: BoardSceneVfxStage;
  stageStartedAtMs: number;
  nowMs: number;
  averageFps: number | null;
}

export type VfxStageTransitionReason =
  | "stable"
  | "hysteresis_guard"
  | "hold_window"
  | "upgrade"
  | "downgrade"
  | "constraint_downgrade"
  | "emergency_low_fps";

export interface VfxStageTransitionDecision {
  nextStage: BoardSceneVfxStage;
  switched: boolean;
  reason: VfxStageTransitionReason;
}

const VFX_STAGE_PRIORITY: Record<BoardSceneVfxStage, number> = {
  off: 0,
  basic: 1,
  full: 2
};

function hasUsableFps(averageFps: number | null): averageFps is number {
  return averageFps !== null && Number.isFinite(averageFps);
}

export function evaluateVfxStage(input: VfxStageInput): BoardSceneVfxStage {
  if (input.renderBootstrapPhase === "boot") {
    return "off";
  }

  if (input.averageFps !== null && Number.isFinite(input.averageFps)) {
    if (input.averageFps < VFX_STAGE_OFF_FPS_THRESHOLD) {
      return "off";
    }
    if (input.averageFps < VFX_STAGE_FULL_FPS_THRESHOLD) {
      return "basic";
    }
  } else {
    return "basic";
  }

  if (!input.sparklesEnabled || input.qualityLevel === "low") {
    return "basic";
  }

  return "full";
}

function resolveHysteresisTarget(input: VfxStageTransitionInput): BoardSceneVfxStage {
  const { currentStage, targetStage } = input;
  if (targetStage === currentStage) {
    return currentStage;
  }
  if (!hasUsableFps(input.averageFps)) {
    return targetStage;
  }

  const fps = input.averageFps;

  if (currentStage === "off") {
    if (targetStage === "full") {
      if (fps >= VFX_STAGE_BASIC_TO_FULL_FPS) {
        return "full";
      }
      return fps >= VFX_STAGE_OFF_TO_BASIC_FPS ? "basic" : "off";
    }
    if (targetStage === "basic") {
      return fps >= VFX_STAGE_OFF_TO_BASIC_FPS ? "basic" : "off";
    }
    return "off";
  }

  if (currentStage === "basic") {
    if (targetStage === "off") {
      if (fps >= VFX_STAGE_OFF_FPS_THRESHOLD) {
        return "off";
      }
      return fps <= VFX_STAGE_BASIC_TO_OFF_FPS ? "off" : "basic";
    }
    if (targetStage === "full") {
      return fps >= VFX_STAGE_BASIC_TO_FULL_FPS ? "full" : "basic";
    }
    return "basic";
  }

  if (targetStage === "off") {
    if (fps >= VFX_STAGE_OFF_FPS_THRESHOLD) {
      return "off";
    }
    if (fps <= VFX_STAGE_BASIC_TO_OFF_FPS) {
      return "off";
    }
    return fps <= VFX_STAGE_FULL_TO_BASIC_FPS ? "basic" : "full";
  }

  if (targetStage === "basic") {
    if (fps >= VFX_STAGE_FULL_FPS_THRESHOLD) {
      return "basic";
    }
    return fps <= VFX_STAGE_FULL_TO_BASIC_FPS ? "basic" : "full";
  }

  return "full";
}

function canBypassHoldForConstraintDowngrade(input: VfxStageTransitionInput): boolean {
  if (VFX_STAGE_PRIORITY[input.targetStage] >= VFX_STAGE_PRIORITY[input.currentStage]) {
    return false;
  }
  if (!hasUsableFps(input.averageFps)) {
    return true;
  }
  if (input.targetStage === "off" && input.averageFps >= VFX_STAGE_OFF_FPS_THRESHOLD) {
    return true;
  }
  if (
    input.currentStage === "full" &&
    input.targetStage === "basic" &&
    input.averageFps >= VFX_STAGE_FULL_FPS_THRESHOLD
  ) {
    return true;
  }
  return false;
}

export function evaluateVfxStageTransition(
  input: VfxStageTransitionInput
): VfxStageTransitionDecision {
  if (
    hasUsableFps(input.averageFps) &&
    input.averageFps < VFX_STAGE_EMERGENCY_OFF_FPS &&
    input.currentStage !== "off"
  ) {
    return {
      nextStage: "off",
      switched: true,
      reason: "emergency_low_fps"
    };
  }

  const nextStage = resolveHysteresisTarget(input);
  if (nextStage === input.currentStage) {
    return {
      nextStage: input.currentStage,
      switched: false,
      reason: nextStage === input.targetStage ? "stable" : "hysteresis_guard"
    };
  }

  const elapsedMs = Math.max(0, input.nowMs - input.stageStartedAtMs);
  const downgrade = VFX_STAGE_PRIORITY[nextStage] < VFX_STAGE_PRIORITY[input.currentStage];
  const bypassHold = downgrade && canBypassHoldForConstraintDowngrade(input);

  if (!bypassHold && elapsedMs < VFX_STAGE_HOLD_MS) {
    return {
      nextStage: input.currentStage,
      switched: false,
      reason: "hold_window"
    };
  }

  if (bypassHold) {
    return {
      nextStage,
      switched: true,
      reason: "constraint_downgrade"
    };
  }

  return {
    nextStage,
    switched: true,
    reason: downgrade ? "downgrade" : "upgrade"
  };
}
