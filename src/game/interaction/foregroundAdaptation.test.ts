import { describe, expect, it } from "vitest";
import {
  FOREGROUND_RECOVERY_STABILIZE_MS,
  isForegroundFpsTrusted,
  shouldAllowAdaptiveRenderTuning
} from "./foregroundAdaptation";

describe("isForegroundFpsTrusted", () => {
  it("returns false in background", () => {
    const hidden = isForegroundFpsTrusted({
      pageVisible: false,
      windowFocused: true,
      returnedToForegroundAtMs: null,
      nowMs: 10_000
    });
    const blurred = isForegroundFpsTrusted({
      pageVisible: true,
      windowFocused: false,
      returnedToForegroundAtMs: null,
      nowMs: 10_000
    });

    expect(hidden).toBe(false);
    expect(blurred).toBe(false);
  });

  it("returns true when foreground has no recent return marker", () => {
    const trusted = isForegroundFpsTrusted({
      pageVisible: true,
      windowFocused: true,
      returnedToForegroundAtMs: null,
      nowMs: 10_000
    });

    expect(trusted).toBe(true);
  });

  it("returns false within stabilize window after returning to foreground", () => {
    const trusted = isForegroundFpsTrusted({
      pageVisible: true,
      windowFocused: true,
      returnedToForegroundAtMs: 10_000,
      nowMs: 10_000 + FOREGROUND_RECOVERY_STABILIZE_MS - 1
    });

    expect(trusted).toBe(false);
  });

  it("returns true after stabilize window", () => {
    const trusted = isForegroundFpsTrusted({
      pageVisible: true,
      windowFocused: true,
      returnedToForegroundAtMs: 10_000,
      nowMs: 10_000 + FOREGROUND_RECOVERY_STABILIZE_MS
    });

    expect(trusted).toBe(true);
  });
});

describe("shouldAllowAdaptiveRenderTuning", () => {
  it("blocks adaptive tuning in background even with low fps", () => {
    const decision = shouldAllowAdaptiveRenderTuning({
      pageVisible: false,
      windowFocused: true,
      returnedToForegroundAtMs: 10_000,
      nowMs: 10_100,
      averageFps: 8
    });

    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe("background");
  });

  it("blocks adaptive tuning during foreground stabilize window for normal fps", () => {
    const decision = shouldAllowAdaptiveRenderTuning({
      pageVisible: true,
      windowFocused: true,
      returnedToForegroundAtMs: 10_000,
      nowMs: 10_300,
      averageFps: 48
    });

    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe("stabilizing");
  });

  it("allows emergency downgrade during stabilize window for extreme low fps", () => {
    const decision = shouldAllowAdaptiveRenderTuning({
      pageVisible: true,
      windowFocused: true,
      returnedToForegroundAtMs: 10_000,
      nowMs: 10_300,
      averageFps: 14
    });

    expect(decision.allow).toBe(true);
    expect(decision.reason).toBe("emergency_low_fps");
  });

  it("allows adaptive tuning after stabilize window", () => {
    const decision = shouldAllowAdaptiveRenderTuning({
      pageVisible: true,
      windowFocused: true,
      returnedToForegroundAtMs: 10_000,
      nowMs: 10_000 + FOREGROUND_RECOVERY_STABILIZE_MS + 50,
      averageFps: 44
    });

    expect(decision.allow).toBe(true);
    expect(decision.reason).toBe("trusted_foreground");
  });
});
