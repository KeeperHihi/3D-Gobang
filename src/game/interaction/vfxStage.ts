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
