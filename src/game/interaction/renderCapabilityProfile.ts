import type { QualityLevel, QualityMode } from "./qualityProfile";
import type { BoardSceneVfxStage } from "./vfxStage";

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
}

interface DeviceFingerprintInput {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  devicePixelRatio?: number;
  platform?: string;
}

export interface RenderCapabilityProfile {
  schemaVersion: number;
  deviceKey: string;
  recommendedInitialQualityLevel: QualityLevel;
  recommendedInitialVfxStage: BoardSceneVfxStage;
  confidence: number;
  updatedAtMs: number;
  sampleCount: number;
}

export interface ResolveInitialRenderPresetInput {
  qualityMode: QualityMode;
  fallbackQualityLevel: QualityLevel;
  fallbackVfxStage: BoardSceneVfxStage;
  profile: RenderCapabilityProfile | null;
}

export interface RenderCapabilityProfileReadInput {
  storage: StorageLike | null;
  nowMs: number;
  deviceKey: string;
}

export interface RenderCapabilityProfileUpdateInput {
  storage: StorageLike | null;
  nowMs: number;
  deviceKey: string;
  averageFps: number | null;
  autoCalmMode: boolean;
  qualityLevel: QualityLevel;
  vfxStage: BoardSceneVfxStage;
  sampleTrusted: boolean;
  consecutiveLowFpsTrustedSamples: number;
}

export interface InitialRenderPreset {
  initialQualityLevel: QualityLevel;
  initialVfxStage: BoardSceneVfxStage;
  confidence: number;
}

export const RENDER_CAPABILITY_PROFILE_STORAGE_KEY = "nebula-cube-render-capability-profile-v1";
export const RENDER_CAPABILITY_PROFILE_SCHEMA_VERSION = 1;
export const RENDER_CAPABILITY_PROFILE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RENDER_CAPABILITY_PROFILE_MIN_CONFIDENCE = 0.45;
export const RENDER_CAPABILITY_PROFILE_MIN_TRUSTED_LOW_FPS_SAMPLES = 2;

const QUALITY_LEVEL_ORDER: QualityLevel[] = ["low", "medium", "high", "ultra"];
const VFX_STAGE_ORDER: BoardSceneVfxStage[] = ["off", "basic", "full"];

function normalizeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeQualityLevel(value: unknown): QualityLevel | null {
  if (value === "ultra" || value === "high" || value === "medium" || value === "low") {
    return value;
  }
  return null;
}

function normalizeVfxStage(value: unknown): BoardSceneVfxStage | null {
  if (value === "off" || value === "basic" || value === "full") {
    return value;
  }
  return null;
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isLowerByOrder<T extends string>(candidate: T, baseline: T, order: T[]): boolean {
  const candidateIndex = order.indexOf(candidate);
  const baselineIndex = order.indexOf(baseline);
  if (candidateIndex < 0 || baselineIndex < 0) {
    return false;
  }
  return candidateIndex < baselineIndex;
}

function chooseConservative<T extends string>(current: T, target: T, order: T[], confidence: number): T {
  const currentIndex = order.indexOf(current);
  const targetIndex = order.indexOf(target);
  if (currentIndex < 0 || targetIndex < 0) {
    return target;
  }
  if (targetIndex < currentIndex) {
    return target;
  }
  if (targetIndex > currentIndex) {
    return confidence >= 0.75 ? target : current;
  }
  return current;
}

function deriveRecommendationFromSample(input: {
  averageFps: number;
  autoCalmMode: boolean;
  qualityLevel: QualityLevel;
  vfxStage: BoardSceneVfxStage;
}): { qualityLevel: QualityLevel; vfxStage: BoardSceneVfxStage } {
  if (input.autoCalmMode || input.averageFps < 30) {
    return {
      qualityLevel: "low",
      vfxStage: "off"
    };
  }

  if (input.averageFps < 40) {
    return {
      qualityLevel: "medium",
      vfxStage: "basic"
    };
  }

  if (input.averageFps < 54) {
    return {
      qualityLevel: input.qualityLevel === "ultra" ? "high" : input.qualityLevel,
      vfxStage: "basic"
    };
  }

  return {
    qualityLevel: input.qualityLevel === "low" ? "medium" : "high",
    vfxStage: input.vfxStage === "off" ? "basic" : input.vfxStage
  };
}

function safeGetItem(storage: StorageLike | null, key: string): string | null {
  if (!storage) {
    return null;
  }
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(storage: StorageLike | null, key: string, value: string): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(key, value);
  } catch {
    // Ignore storage write errors and keep runtime defaults.
  }
}

function safeRemoveItem(storage: StorageLike | null, key: string): void {
  if (!storage || typeof storage.removeItem !== "function") {
    return;
  }
  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage remove errors.
  }
}

function parseProfile(raw: string): RenderCapabilityProfile | null {
  try {
    const parsed = JSON.parse(raw) as Partial<RenderCapabilityProfile>;
    if (parsed.schemaVersion !== RENDER_CAPABILITY_PROFILE_SCHEMA_VERSION) {
      return null;
    }
    const recommendedInitialQualityLevel = normalizeQualityLevel(parsed.recommendedInitialQualityLevel);
    const recommendedInitialVfxStage = normalizeVfxStage(parsed.recommendedInitialVfxStage);
    const confidence = normalizeNumber(parsed.confidence);
    const updatedAtMs = normalizeNumber(parsed.updatedAtMs);
    const sampleCount = normalizeNumber(parsed.sampleCount);

    if (
      typeof parsed.deviceKey !== "string" ||
      !recommendedInitialQualityLevel ||
      !recommendedInitialVfxStage ||
      confidence === null ||
      updatedAtMs === null ||
      sampleCount === null
    ) {
      return null;
    }

    return {
      schemaVersion: RENDER_CAPABILITY_PROFILE_SCHEMA_VERSION,
      deviceKey: parsed.deviceKey,
      recommendedInitialQualityLevel,
      recommendedInitialVfxStage,
      confidence: clampConfidence(confidence),
      updatedAtMs,
      sampleCount: Math.max(0, Math.floor(sampleCount))
    };
  } catch {
    return null;
  }
}

function hasUsableFps(averageFps: number | null): averageFps is number {
  return averageFps !== null && Number.isFinite(averageFps);
}

export function resolveRenderCapabilityStorage(): StorageLike | null {
  try {
    if (typeof localStorage === "undefined") {
      return null;
    }
    return localStorage;
  } catch {
    return null;
  }
}

export function createRenderDeviceKey(input: DeviceFingerprintInput): string {
  const normalizedHardwareConcurrency =
    typeof input.hardwareConcurrency === "number" && Number.isFinite(input.hardwareConcurrency)
      ? Math.max(1, Math.min(32, Math.floor(input.hardwareConcurrency)))
      : 0;
  const normalizedDeviceMemory =
    typeof input.deviceMemory === "number" && Number.isFinite(input.deviceMemory)
      ? Math.max(0.5, Math.min(64, Math.round(input.deviceMemory * 10) / 10))
      : 0;
  const normalizedDpr =
    typeof input.devicePixelRatio === "number" && Number.isFinite(input.devicePixelRatio)
      ? Math.max(0.75, Math.min(4, Math.round(input.devicePixelRatio * 10) / 10))
      : 1;
  const normalizedPlatform =
    typeof input.platform === "string" && input.platform.trim().length > 0
      ? input.platform.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 24)
      : "unknown";

  return `hc:${normalizedHardwareConcurrency || "na"}|dm:${normalizedDeviceMemory || "na"}|dpr:${normalizedDpr}|pf:${normalizedPlatform}`;
}

export function resolveRenderDeviceKey(): string {
  const maybeNavigator =
    typeof navigator === "undefined"
      ? null
      : (navigator as Navigator & {
          deviceMemory?: number;
        });
  const maybeWindow = typeof window === "undefined" ? null : window;

  return createRenderDeviceKey({
    hardwareConcurrency: maybeNavigator?.hardwareConcurrency,
    deviceMemory: maybeNavigator?.deviceMemory,
    devicePixelRatio: maybeWindow?.devicePixelRatio,
    platform: maybeNavigator?.platform
  });
}

export function readRenderCapabilityProfile(
  input: RenderCapabilityProfileReadInput
): RenderCapabilityProfile | null {
  const raw = safeGetItem(input.storage, RENDER_CAPABILITY_PROFILE_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  const parsed = parseProfile(raw);
  if (!parsed) {
    safeRemoveItem(input.storage, RENDER_CAPABILITY_PROFILE_STORAGE_KEY);
    return null;
  }
  if (parsed.deviceKey !== input.deviceKey) {
    return null;
  }
  if (input.nowMs - parsed.updatedAtMs > RENDER_CAPABILITY_PROFILE_TTL_MS) {
    safeRemoveItem(input.storage, RENDER_CAPABILITY_PROFILE_STORAGE_KEY);
    return null;
  }
  return parsed;
}

export function resolveInitialRenderPreset(input: ResolveInitialRenderPresetInput): InitialRenderPreset {
  if (input.qualityMode !== "auto" || !input.profile) {
    return {
      initialQualityLevel: input.fallbackQualityLevel,
      initialVfxStage: input.fallbackVfxStage,
      confidence: 0
    };
  }
  if (input.profile.confidence < RENDER_CAPABILITY_PROFILE_MIN_CONFIDENCE) {
    return {
      initialQualityLevel: input.fallbackQualityLevel,
      initialVfxStage: input.fallbackVfxStage,
      confidence: input.profile.confidence
    };
  }

  return {
    initialQualityLevel: input.profile.recommendedInitialQualityLevel,
    initialVfxStage: input.profile.recommendedInitialVfxStage,
    confidence: input.profile.confidence
  };
}

export function updateRenderCapabilityProfile(
  input: RenderCapabilityProfileUpdateInput
): RenderCapabilityProfile | null {
  const current = readRenderCapabilityProfile({
    storage: input.storage,
    nowMs: input.nowMs,
    deviceKey: input.deviceKey
  });

  if (!hasUsableFps(input.averageFps)) {
    return current;
  }
  if (!input.sampleTrusted) {
    return current;
  }

  const recommendation = deriveRecommendationFromSample({
    averageFps: input.averageFps,
    autoCalmMode: input.autoCalmMode,
    qualityLevel: input.qualityLevel,
    vfxStage: input.vfxStage
  });

  const lowFpsTrustedReadyForDowngrade =
    input.consecutiveLowFpsTrustedSamples >= RENDER_CAPABILITY_PROFILE_MIN_TRUSTED_LOW_FPS_SAMPLES;

  const baselineQualityLevel = current?.recommendedInitialQualityLevel ?? input.qualityLevel;
  const baselineVfxStage = current?.recommendedInitialVfxStage ?? input.vfxStage;
  const guardedRecommendation = {
    qualityLevel:
      !lowFpsTrustedReadyForDowngrade &&
      isLowerByOrder(recommendation.qualityLevel, baselineQualityLevel, QUALITY_LEVEL_ORDER)
        ? baselineQualityLevel
        : recommendation.qualityLevel,
    vfxStage:
      !lowFpsTrustedReadyForDowngrade &&
      isLowerByOrder(recommendation.vfxStage, baselineVfxStage, VFX_STAGE_ORDER)
        ? baselineVfxStage
        : recommendation.vfxStage
  };

  let next: RenderCapabilityProfile;
  if (!current) {
    next = {
      schemaVersion: RENDER_CAPABILITY_PROFILE_SCHEMA_VERSION,
      deviceKey: input.deviceKey,
      recommendedInitialQualityLevel: guardedRecommendation.qualityLevel,
      recommendedInitialVfxStage: guardedRecommendation.vfxStage,
      confidence: 0.5,
      updatedAtMs: input.nowMs,
      sampleCount: 1
    };
  } else {
    const nextSampleCount = Math.min(20, current.sampleCount + 1);
    const nextConfidence = Math.max(
      current.confidence,
      clampConfidence(0.3 + nextSampleCount * 0.2)
    );

    next = {
      schemaVersion: RENDER_CAPABILITY_PROFILE_SCHEMA_VERSION,
      deviceKey: current.deviceKey,
      recommendedInitialQualityLevel: chooseConservative(
        current.recommendedInitialQualityLevel,
        guardedRecommendation.qualityLevel,
        QUALITY_LEVEL_ORDER,
        nextConfidence
      ),
      recommendedInitialVfxStage: chooseConservative(
        current.recommendedInitialVfxStage,
        guardedRecommendation.vfxStage,
        VFX_STAGE_ORDER,
        nextConfidence
      ),
      confidence: nextConfidence,
      updatedAtMs: input.nowMs,
      sampleCount: nextSampleCount
    };
  }

  safeSetItem(input.storage, RENDER_CAPABILITY_PROFILE_STORAGE_KEY, JSON.stringify(next));
  return next;
}
