export type QualityLevel = "ultra" | "high" | "medium" | "low";
export type QualityMode = "auto" | "quality" | "smooth";

export interface QualityProfile {
  starsCount: number;
  sparklesCount: number;
  sparklesSpeed: number;
  sparklesSize: number;
  fogFar: number;
  hintPulseSpeed: number;
  hintPulseOpacityScale: number;
  emptyCellOpacityScale: number;
}

export interface QualityTransitionInput {
  mode: QualityMode;
  currentLevel: QualityLevel;
  averageFps: number | null;
  nowMs: number;
  lastSwitchAtMs: number;
}

export const DEFAULT_QUALITY_LEVEL: QualityLevel = "high";
export const DEFAULT_QUALITY_MODE: QualityMode = "auto";
export const QUALITY_SWITCH_MIN_INTERVAL_MS = 4000;

const QUALITY_LEVEL_ORDER: QualityLevel[] = ["low", "medium", "high", "ultra"];

export const QUALITY_PROFILES: Record<QualityLevel, QualityProfile> = {
  ultra: {
    starsCount: 3200,
    sparklesCount: 180,
    sparklesSpeed: 0.36,
    sparklesSize: 2.3,
    fogFar: 38,
    hintPulseSpeed: 2.8,
    hintPulseOpacityScale: 1,
    emptyCellOpacityScale: 1
  },
  high: {
    starsCount: 2400,
    sparklesCount: 130,
    sparklesSpeed: 0.32,
    sparklesSize: 2.1,
    fogFar: 36,
    hintPulseSpeed: 2.5,
    hintPulseOpacityScale: 0.92,
    emptyCellOpacityScale: 0.95
  },
  medium: {
    starsCount: 1500,
    sparklesCount: 85,
    sparklesSpeed: 0.27,
    sparklesSize: 1.85,
    fogFar: 34,
    hintPulseSpeed: 2.1,
    hintPulseOpacityScale: 0.82,
    emptyCellOpacityScale: 0.88
  },
  low: {
    starsCount: 900,
    sparklesCount: 45,
    sparklesSpeed: 0.22,
    sparklesSize: 1.45,
    fogFar: 32,
    hintPulseSpeed: 1.75,
    hintPulseOpacityScale: 0.72,
    emptyCellOpacityScale: 0.8
  }
};

export function getQualityProfile(level: QualityLevel): QualityProfile {
  return QUALITY_PROFILES[level];
}

function clampLevelByIndex(index: number): QualityLevel {
  if (index <= 0) {
    return "low";
  }
  if (index >= QUALITY_LEVEL_ORDER.length - 1) {
    return "ultra";
  }
  return QUALITY_LEVEL_ORDER[index];
}

function nextHigherLevel(level: QualityLevel): QualityLevel {
  const currentIndex = QUALITY_LEVEL_ORDER.indexOf(level);
  return clampLevelByIndex(currentIndex + 1);
}

function nextLowerLevel(level: QualityLevel): QualityLevel {
  const currentIndex = QUALITY_LEVEL_ORDER.indexOf(level);
  return clampLevelByIndex(currentIndex - 1);
}

function modeToFixedLevel(mode: Exclude<QualityMode, "auto">): QualityLevel {
  if (mode === "quality") {
    return "ultra";
  }
  return "low";
}

export function selectQualityLevel(input: QualityTransitionInput): QualityLevel {
  if (input.mode !== "auto") {
    return modeToFixedLevel(input.mode);
  }

  if (input.averageFps === null || !Number.isFinite(input.averageFps)) {
    return input.currentLevel;
  }

  const elapsed = input.nowMs - input.lastSwitchAtMs;
  if (elapsed < QUALITY_SWITCH_MIN_INTERVAL_MS) {
    return input.currentLevel;
  }

  if (input.averageFps < 34) {
    return nextLowerLevel(input.currentLevel);
  }

  if (input.averageFps > 56) {
    return nextHigherLevel(input.currentLevel);
  }

  return input.currentLevel;
}

export function qualityModeLabel(mode: QualityMode): string {
  if (mode === "auto") {
    return "自动";
  }
  if (mode === "quality") {
    return "画质优先";
  }
  return "流畅优先";
}

export function qualityLevelLabel(level: QualityLevel): string {
  if (level === "ultra") {
    return "Ultra";
  }
  if (level === "high") {
    return "High";
  }
  if (level === "medium") {
    return "Medium";
  }
  return "Low";
}
