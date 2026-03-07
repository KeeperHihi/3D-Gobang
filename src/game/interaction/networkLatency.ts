import { DEFAULT_TIMEOUT_ASSIST_THRESHOLD_MS } from "./timeoutAssist";

export type TimeoutAssistNetworkTier = "default" | "stable" | "elevated" | "unstable";

export interface NetworkLatencyProfile {
  recentRttSamplesMs: number[];
  sampleCount: number;
  averageRttMs: number | null;
  jitterMs: number | null;
  recommendedThresholdMs: number;
  networkTier: TimeoutAssistNetworkTier;
}

export const LATENCY_SAMPLE_WINDOW_SIZE = 8;
export const LATENCY_ADAPTIVE_MIN_SAMPLES = 3;
export const LATENCY_SAMPLE_MIN_MS = 60;
export const LATENCY_SAMPLE_MAX_MS = 3_000;
export const TIMEOUT_ASSIST_THRESHOLD_MIN_MS = 2_000;
export const TIMEOUT_ASSIST_THRESHOLD_MAX_MS = 6_000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeLatencySampleMs(rttMs: number): number | null {
  if (!Number.isFinite(rttMs) || rttMs <= 0) {
    return null;
  }
  return clamp(Math.round(rttMs), LATENCY_SAMPLE_MIN_MS, LATENCY_SAMPLE_MAX_MS);
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function meanAbsoluteDeviation(values: number[], center: number): number {
  if (values.length <= 1) {
    return 0;
  }
  const distanceSum = values.reduce((sum, value) => sum + Math.abs(value - center), 0);
  return distanceSum / values.length;
}

function resolveNetworkTier(
  sampleCount: number,
  averageRttMs: number | null,
  jitterMs: number | null
): TimeoutAssistNetworkTier {
  if (
    sampleCount < LATENCY_ADAPTIVE_MIN_SAMPLES ||
    averageRttMs === null ||
    jitterMs === null
  ) {
    return "default";
  }
  if (averageRttMs >= 700 || jitterMs >= 220) {
    return "unstable";
  }
  if (averageRttMs >= 420 || jitterMs >= 120) {
    return "elevated";
  }
  return "stable";
}

function recommendTimeoutAssistThresholdMs(
  sampleCount: number,
  averageRttMs: number | null,
  jitterMs: number | null
): number {
  if (
    sampleCount < LATENCY_ADAPTIVE_MIN_SAMPLES ||
    averageRttMs === null ||
    jitterMs === null
  ) {
    return DEFAULT_TIMEOUT_ASSIST_THRESHOLD_MS;
  }
  const adaptiveThreshold = averageRttMs * 2 + jitterMs * 3 + 1_200;
  return clamp(
    Math.round(adaptiveThreshold),
    TIMEOUT_ASSIST_THRESHOLD_MIN_MS,
    TIMEOUT_ASSIST_THRESHOLD_MAX_MS
  );
}

function buildNetworkLatencyProfileFromSamples(samples: number[]): NetworkLatencyProfile {
  if (samples.length === 0) {
    return {
      recentRttSamplesMs: [],
      sampleCount: 0,
      averageRttMs: null,
      jitterMs: null,
      recommendedThresholdMs: DEFAULT_TIMEOUT_ASSIST_THRESHOLD_MS,
      networkTier: "default"
    };
  }

  const averageRttMs = Math.round(average(samples));
  const jitterMs = Math.round(meanAbsoluteDeviation(samples, averageRttMs));
  const sampleCount = samples.length;

  return {
    recentRttSamplesMs: samples,
    sampleCount,
    averageRttMs,
    jitterMs,
    recommendedThresholdMs: recommendTimeoutAssistThresholdMs(
      sampleCount,
      averageRttMs,
      jitterMs
    ),
    networkTier: resolveNetworkTier(sampleCount, averageRttMs, jitterMs)
  };
}

export function createInitialNetworkLatencyProfile(): NetworkLatencyProfile {
  return buildNetworkLatencyProfileFromSamples([]);
}

export function updateLatencySamples(
  previous: NetworkLatencyProfile,
  rttMs: number
): NetworkLatencyProfile {
  const sanitizedSample = sanitizeLatencySampleMs(rttMs);
  if (sanitizedSample === null) {
    return previous;
  }

  const nextSamples = [...previous.recentRttSamplesMs, sanitizedSample].slice(
    -LATENCY_SAMPLE_WINDOW_SIZE
  );
  return buildNetworkLatencyProfileFromSamples(nextSamples);
}

export function deriveTimeoutAssistThresholdMs(profile: NetworkLatencyProfile): number {
  return clamp(
    profile.recommendedThresholdMs,
    TIMEOUT_ASSIST_THRESHOLD_MIN_MS,
    TIMEOUT_ASSIST_THRESHOLD_MAX_MS
  );
}
