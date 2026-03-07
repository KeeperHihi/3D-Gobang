import { describe, expect, it } from "vitest";
import {
  ADAPTIVE_TICK_FAST_MS,
  ADAPTIVE_TICK_MEDIUM_MS,
  ADAPTIVE_TICK_SLOW_MS,
  ADAPTIVE_TICK_SWITCH_MIN_HOLD_MS,
  ADAPTIVE_TICK_TIMEOUT_GUARD_BUFFER_MS,
  evaluateAdaptiveTick,
  selectAdaptiveTickTarget
} from "./adaptiveTick";

describe("selectAdaptiveTickTarget", () => {
  it("uses fast tick during bootstrap", () => {
    const target = selectAdaptiveTickTarget({
      renderBootstrapPhase: "boot",
      turnRemainingMs: null,
      opponentReconnectRemainingMs: null,
      timeoutAssistThresholdMs: 2500
    });

    expect(target.intervalMs).toBe(ADAPTIVE_TICK_FAST_MS);
    expect(target.reason).toBe("boot");
  });

  it("uses medium tick for non-urgent turn countdown", () => {
    const target = selectAdaptiveTickTarget({
      renderBootstrapPhase: "steady",
      turnRemainingMs: 16_000,
      opponentReconnectRemainingMs: null,
      timeoutAssistThresholdMs: 2500
    });

    expect(target.intervalMs).toBe(ADAPTIVE_TICK_MEDIUM_MS);
    expect(target.reason).toBe("turn-mid");
  });

  it("uses fast tick when approaching timeout-assist guard window", () => {
    const thresholdMs = 2500;
    const target = selectAdaptiveTickTarget({
      renderBootstrapPhase: "steady",
      turnRemainingMs: thresholdMs + ADAPTIVE_TICK_TIMEOUT_GUARD_BUFFER_MS,
      opponentReconnectRemainingMs: null,
      timeoutAssistThresholdMs: thresholdMs
    });

    expect(target.intervalMs).toBe(ADAPTIVE_TICK_FAST_MS);
    expect(target.reason).toBe("turn-urgent");
  });

  it("uses reconnect urgency when turn clock is unavailable", () => {
    const target = selectAdaptiveTickTarget({
      renderBootstrapPhase: "steady",
      turnRemainingMs: null,
      opponentReconnectRemainingMs: 9_000,
      timeoutAssistThresholdMs: 2500
    });

    expect(target.intervalMs).toBe(ADAPTIVE_TICK_FAST_MS);
    expect(target.reason).toBe("reconnect-urgent");
  });

  it("falls back to slow tick for calm scenes", () => {
    const target = selectAdaptiveTickTarget({
      renderBootstrapPhase: "steady",
      turnRemainingMs: null,
      opponentReconnectRemainingMs: null,
      timeoutAssistThresholdMs: 2500
    });

    expect(target.intervalMs).toBe(ADAPTIVE_TICK_SLOW_MS);
    expect(target.reason).toBe("idle");
  });
});

describe("evaluateAdaptiveTick", () => {
  it("prevents downgrade before minimum hold window", () => {
    const decision = evaluateAdaptiveTick({
      nowMs: 10_000,
      renderBootstrapPhase: "steady",
      turnRemainingMs: null,
      opponentReconnectRemainingMs: null,
      timeoutAssistThresholdMs: 2500,
      currentIntervalMs: ADAPTIVE_TICK_FAST_MS,
      currentIntervalStartedAtMs: 10_000 - ADAPTIVE_TICK_SWITCH_MIN_HOLD_MS + 200
    });

    expect(decision.intervalMs).toBe(ADAPTIVE_TICK_FAST_MS);
    expect(decision.switched).toBe(false);
    expect(decision.reason).toBe("hold");
  });

  it("allows immediate escalation to higher frequency", () => {
    const decision = evaluateAdaptiveTick({
      nowMs: 10_000,
      renderBootstrapPhase: "steady",
      turnRemainingMs: 4_000,
      opponentReconnectRemainingMs: null,
      timeoutAssistThresholdMs: 2500,
      currentIntervalMs: ADAPTIVE_TICK_SLOW_MS,
      currentIntervalStartedAtMs: 9_500
    });

    expect(decision.intervalMs).toBe(ADAPTIVE_TICK_FAST_MS);
    expect(decision.switched).toBe(true);
    expect(decision.reason).toBe("turn-urgent");
  });

  it("downgrades after hold window elapsed", () => {
    const decision = evaluateAdaptiveTick({
      nowMs: 20_000,
      renderBootstrapPhase: "steady",
      turnRemainingMs: null,
      opponentReconnectRemainingMs: null,
      timeoutAssistThresholdMs: 2500,
      currentIntervalMs: ADAPTIVE_TICK_MEDIUM_MS,
      currentIntervalStartedAtMs: 20_000 - ADAPTIVE_TICK_SWITCH_MIN_HOLD_MS - 1
    });

    expect(decision.intervalMs).toBe(ADAPTIVE_TICK_SLOW_MS);
    expect(decision.switched).toBe(true);
    expect(decision.reason).toBe("idle");
  });
});
