import type { QualityLevel, QualityMode } from "./qualityProfile";

export type RenderBootstrapPhase = "boot" | "steady";

export interface RenderBootstrapInput {
  elapsedMs: number;
  averageFps: number | null;
  qualityMode: QualityMode;
}

export interface RenderBootstrapDecision {
  phase: RenderBootstrapPhase;
  ambientEnabled: boolean;
  qualityCap: QualityLevel | null;
}

export const RENDER_BOOT_MAX_DURATION_MS = 1_200;
export const RENDER_BOOT_MIN_DURATION_MS = 450;
export const RENDER_BOOT_EARLY_EXIT_FPS = 50;

const QUALITY_RANK: Record<QualityLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  ultra: 3
};

export function clampQualityLevelByCap(
  level: QualityLevel,
  cap: QualityLevel | null
): QualityLevel {
  if (!cap) {
    return level;
  }
  return QUALITY_RANK[level] <= QUALITY_RANK[cap] ? level : cap;
}

export function evaluateRenderBootstrap(input: RenderBootstrapInput): RenderBootstrapDecision {
  const safeElapsedMs = Math.max(0, Math.floor(input.elapsedMs));
  const hasStableFpsSignal =
    input.averageFps !== null &&
    Number.isFinite(input.averageFps) &&
    input.averageFps >= RENDER_BOOT_EARLY_EXIT_FPS;
  const shouldExitBoot =
    safeElapsedMs >= RENDER_BOOT_MAX_DURATION_MS ||
    (safeElapsedMs >= RENDER_BOOT_MIN_DURATION_MS && hasStableFpsSignal);
  const phase: RenderBootstrapPhase = shouldExitBoot ? "steady" : "boot";

  return {
    phase,
    ambientEnabled: phase === "steady",
    qualityCap: phase === "boot" && input.qualityMode === "auto" ? "medium" : null
  };
}
