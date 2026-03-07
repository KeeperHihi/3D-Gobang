import { describe, expect, it } from "vitest";
import {
  RENDER_CAPABILITY_PROFILE_SCHEMA_VERSION,
  RENDER_CAPABILITY_PROFILE_STORAGE_KEY,
  RENDER_CAPABILITY_PROFILE_TTL_MS,
  createRenderDeviceKey,
  readRenderCapabilityProfile,
  resolveRenderCapabilityStorage,
  resolveInitialRenderPreset,
  updateRenderCapabilityProfile
} from "./renderCapabilityProfile";

function createMemoryStorage() {
  const memory = new Map<string, string>();
  return {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    }
  };
}

describe("renderCapabilityProfile", () => {
  it("reads valid profile and expires it by TTL", () => {
    const storage = createMemoryStorage();
    const deviceKey = "device-a";
    storage.setItem(
      RENDER_CAPABILITY_PROFILE_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: RENDER_CAPABILITY_PROFILE_SCHEMA_VERSION,
        deviceKey,
        recommendedInitialQualityLevel: "medium",
        recommendedInitialVfxStage: "basic",
        confidence: 0.8,
        updatedAtMs: 1_000,
        sampleCount: 3
      })
    );

    const valid = readRenderCapabilityProfile({
      storage,
      nowMs: 1_500,
      deviceKey
    });
    const expired = readRenderCapabilityProfile({
      storage,
      nowMs: 1_000 + RENDER_CAPABILITY_PROFILE_TTL_MS + 1,
      deviceKey
    });

    expect(valid?.recommendedInitialQualityLevel).toBe("medium");
    expect(expired).toBeNull();
    expect(storage.getItem(RENDER_CAPABILITY_PROFILE_STORAGE_KEY)).toBeNull();
  });

  it("falls back when device key mismatches or schema is incompatible", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      RENDER_CAPABILITY_PROFILE_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 999,
        deviceKey: "old-device",
        recommendedInitialQualityLevel: "high",
        recommendedInitialVfxStage: "full",
        confidence: 1,
        updatedAtMs: 1000,
        sampleCount: 8
      })
    );

    const invalidSchema = readRenderCapabilityProfile({
      storage,
      nowMs: 2000,
      deviceKey: "old-device"
    });
    expect(invalidSchema).toBeNull();

    storage.setItem(
      RENDER_CAPABILITY_PROFILE_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: RENDER_CAPABILITY_PROFILE_SCHEMA_VERSION,
        deviceKey: "device-a",
        recommendedInitialQualityLevel: "high",
        recommendedInitialVfxStage: "full",
        confidence: 1,
        updatedAtMs: 1000,
        sampleCount: 8
      })
    );

    const mismatched = readRenderCapabilityProfile({
      storage,
      nowMs: 2000,
      deviceKey: "device-b"
    });

    expect(mismatched).toBeNull();
  });

  it("maps low/mid/high samples to expected initial presets", () => {
    const storage = createMemoryStorage();
    const deviceKey = "device-map";

    const low = updateRenderCapabilityProfile({
      storage,
      nowMs: 1000,
      deviceKey,
      averageFps: 24,
      autoCalmMode: false,
      qualityLevel: "high",
      vfxStage: "basic"
    });
    expect(low?.recommendedInitialQualityLevel).toBe("low");
    expect(low?.recommendedInitialVfxStage).toBe("off");

    const mid = updateRenderCapabilityProfile({
      storage,
      nowMs: 2000,
      deviceKey,
      averageFps: 38,
      autoCalmMode: false,
      qualityLevel: "medium",
      vfxStage: "basic"
    });
    expect(mid?.recommendedInitialQualityLevel).toBe("low");
    expect(mid?.recommendedInitialVfxStage).toBe("off");

    updateRenderCapabilityProfile({
      storage,
      nowMs: 3000,
      deviceKey,
      averageFps: 60,
      autoCalmMode: false,
      qualityLevel: "high",
      vfxStage: "full"
    });
    const high = updateRenderCapabilityProfile({
      storage,
      nowMs: 4000,
      deviceKey,
      averageFps: 60,
      autoCalmMode: false,
      qualityLevel: "high",
      vfxStage: "full"
    });

    expect(high?.recommendedInitialQualityLevel).toBe("high");
    expect(high?.recommendedInitialVfxStage).toBe("full");
  });

  it("resolves initial preset only for auto mode with enough confidence", () => {
    const fallback = resolveInitialRenderPreset({
      qualityMode: "auto",
      fallbackQualityLevel: "high",
      fallbackVfxStage: "basic",
      profile: {
        schemaVersion: RENDER_CAPABILITY_PROFILE_SCHEMA_VERSION,
        deviceKey: "device",
        recommendedInitialQualityLevel: "medium",
        recommendedInitialVfxStage: "off",
        confidence: 0.2,
        updatedAtMs: 1000,
        sampleCount: 1
      }
    });
    const applied = resolveInitialRenderPreset({
      qualityMode: "auto",
      fallbackQualityLevel: "high",
      fallbackVfxStage: "basic",
      profile: {
        schemaVersion: RENDER_CAPABILITY_PROFILE_SCHEMA_VERSION,
        deviceKey: "device",
        recommendedInitialQualityLevel: "medium",
        recommendedInitialVfxStage: "off",
        confidence: 0.9,
        updatedAtMs: 1000,
        sampleCount: 5
      }
    });
    const manual = resolveInitialRenderPreset({
      qualityMode: "quality",
      fallbackQualityLevel: "ultra",
      fallbackVfxStage: "full",
      profile: {
        schemaVersion: RENDER_CAPABILITY_PROFILE_SCHEMA_VERSION,
        deviceKey: "device",
        recommendedInitialQualityLevel: "medium",
        recommendedInitialVfxStage: "off",
        confidence: 1,
        updatedAtMs: 1000,
        sampleCount: 9
      }
    });

    expect(fallback.initialQualityLevel).toBe("high");
    expect(fallback.initialVfxStage).toBe("basic");
    expect(applied.initialQualityLevel).toBe("medium");
    expect(applied.initialVfxStage).toBe("off");
    expect(manual.initialQualityLevel).toBe("ultra");
    expect(manual.initialVfxStage).toBe("full");
  });

  it("builds normalized device keys", () => {
    const key = createRenderDeviceKey({
      hardwareConcurrency: 12.9,
      deviceMemory: 7.7,
      devicePixelRatio: 2.37,
      platform: "Mac OS X"
    });

    expect(key).toBe("hc:12|dm:7.7|dpr:2.4|pf:mac_os_x");
  });

  it("returns null when localStorage access throws", () => {
    const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("storage blocked");
      }
    });

    try {
      expect(resolveRenderCapabilityStorage()).toBeNull();
    } finally {
      if (localStorageDescriptor) {
        Object.defineProperty(globalThis, "localStorage", localStorageDescriptor);
      } else {
        delete (globalThis as { localStorage?: unknown }).localStorage;
      }
    }
  });
});
