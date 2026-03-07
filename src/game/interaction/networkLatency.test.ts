import { describe, expect, it } from "vitest";
import {
  LATENCY_SAMPLE_MAX_MS,
  TIMEOUT_ASSIST_THRESHOLD_MAX_MS,
  TIMEOUT_ASSIST_THRESHOLD_MIN_MS,
  createInitialNetworkLatencyProfile,
  deriveTimeoutAssistThresholdMs,
  updateLatencySamples
} from "./networkLatency";
import { DEFAULT_TIMEOUT_ASSIST_THRESHOLD_MS } from "./timeoutAssist";

function createProfile(samples: number[]) {
  return samples.reduce(
    (profile, sample) => updateLatencySamples(profile, sample),
    createInitialNetworkLatencyProfile()
  );
}

describe("network latency profile", () => {
  it("falls back to default threshold when no sample exists", () => {
    const profile = createInitialNetworkLatencyProfile();

    expect(profile.sampleCount).toBe(0);
    expect(profile.networkTier).toBe("default");
    expect(deriveTimeoutAssistThresholdMs(profile)).toBe(DEFAULT_TIMEOUT_ASSIST_THRESHOLD_MS);
  });

  it("keeps default threshold before minimum sample size", () => {
    const profile = createProfile([1_100, 1_050]);

    expect(profile.sampleCount).toBe(2);
    expect(profile.networkTier).toBe("default");
    expect(profile.recommendedThresholdMs).toBe(DEFAULT_TIMEOUT_ASSIST_THRESHOLD_MS);
  });

  it("uses lower clamp in stable low latency networks", () => {
    const profile = createProfile([130, 120, 140, 135]);

    expect(profile.networkTier).toBe("stable");
    expect(profile.recommendedThresholdMs).toBe(TIMEOUT_ASSIST_THRESHOLD_MIN_MS);
  });

  it("raises threshold in sustained high latency networks", () => {
    const profile = createProfile([760, 820, 790, 840, 780]);

    expect(profile.networkTier).toBe("unstable");
    expect(profile.recommendedThresholdMs).toBeGreaterThan(DEFAULT_TIMEOUT_ASSIST_THRESHOLD_MS);
    expect(profile.recommendedThresholdMs).toBeLessThanOrEqual(TIMEOUT_ASSIST_THRESHOLD_MAX_MS);
  });

  it("raises threshold under jitter spikes and clamps outliers", () => {
    const profile = createProfile([220, 220, 250, 1_200, 230, 5_000]);

    expect(profile.recentRttSamplesMs.at(-1)).toBe(LATENCY_SAMPLE_MAX_MS);
    expect(profile.recommendedThresholdMs).toBeGreaterThan(DEFAULT_TIMEOUT_ASSIST_THRESHOLD_MS);
    expect(profile.recommendedThresholdMs).toBeLessThanOrEqual(TIMEOUT_ASSIST_THRESHOLD_MAX_MS);
  });
});
