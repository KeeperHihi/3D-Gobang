import { describe, expect, it } from "vitest";
import {
  BOARD_LOAD_AUTO_RETRY_DELAYS_MS,
  classifyBoardLoadError,
  evaluateBoardLoadRecovery
} from "./boardLoadRecovery";

describe("evaluateBoardLoadRecovery", () => {
  it("marks unrecoverable chunk errors as refresh-required", () => {
    const decision = evaluateBoardLoadRecovery({
      failedAutoRetryCount: 1,
      isOnline: true,
      errorKind: "unrecoverable_chunk"
    });

    expect(decision.shouldAutoRetry).toBe(false);
    expect(decision.nextRetryDelayMs).toBeNull();
    expect(decision.status).toBe("refresh-required");
  });

  it("returns backoff delays by failed count", () => {
    const first = evaluateBoardLoadRecovery({
      failedAutoRetryCount: 0,
      isOnline: true
    });
    const second = evaluateBoardLoadRecovery({
      failedAutoRetryCount: 1,
      isOnline: true
    });
    const third = evaluateBoardLoadRecovery({
      failedAutoRetryCount: 2,
      isOnline: true
    });

    expect(first.shouldAutoRetry).toBe(true);
    expect(first.nextRetryDelayMs).toBe(1_000);
    expect(first.nextAttempt).toBe(1);
    expect(second.nextRetryDelayMs).toBe(2_000);
    expect(second.nextAttempt).toBe(2);
    expect(third.nextRetryDelayMs).toBe(4_000);
    expect(third.nextAttempt).toBe(3);
  });

  it("stops auto retry after retry budget is exhausted", () => {
    const exhausted = evaluateBoardLoadRecovery({
      failedAutoRetryCount: BOARD_LOAD_AUTO_RETRY_DELAYS_MS.length,
      isOnline: true
    });

    expect(exhausted.shouldAutoRetry).toBe(false);
    expect(exhausted.nextRetryDelayMs).toBeNull();
    expect(exhausted.status).toBe("manual-only");
    expect(exhausted.nextAttempt).toBe(BOARD_LOAD_AUTO_RETRY_DELAYS_MS.length);
  });

  it("skips auto retry when offline", () => {
    const decision = evaluateBoardLoadRecovery({
      failedAutoRetryCount: 0,
      isOnline: false
    });

    expect(decision.shouldAutoRetry).toBe(false);
    expect(decision.nextRetryDelayMs).toBeNull();
    expect(decision.status).toBe("offline");
    expect(decision.nextAttempt).toBe(1);
  });

  it("keeps manual-only status when retry budget is exhausted offline", () => {
    const exhaustedOffline = evaluateBoardLoadRecovery({
      failedAutoRetryCount: BOARD_LOAD_AUTO_RETRY_DELAYS_MS.length,
      isOnline: false
    });

    expect(exhaustedOffline.shouldAutoRetry).toBe(false);
    expect(exhaustedOffline.nextRetryDelayMs).toBeNull();
    expect(exhaustedOffline.status).toBe("manual-only");
    expect(exhaustedOffline.nextAttempt).toBe(BOARD_LOAD_AUTO_RETRY_DELAYS_MS.length);
  });

  it("allows retry sequence reset by resetting failed count", () => {
    const reset = evaluateBoardLoadRecovery({
      failedAutoRetryCount: 0,
      isOnline: true
    });

    expect(reset.shouldAutoRetry).toBe(true);
    expect(reset.nextRetryDelayMs).toBe(1_000);
    expect(reset.nextAttempt).toBe(1);
  });
});

describe("classifyBoardLoadError", () => {
  it("detects unrecoverable dynamic chunk loading errors", () => {
    expect(classifyBoardLoadError(new Error("ChunkLoadError: Loading chunk 123 failed"))).toBe(
      "unrecoverable_chunk"
    );
    expect(classifyBoardLoadError("Failed to fetch dynamically imported module")).toBe(
      "unrecoverable_chunk"
    );
  });

  it("defaults unknown errors to transient", () => {
    expect(classifyBoardLoadError(new Error("network timeout"))).toBe("transient");
    expect(classifyBoardLoadError(null)).toBe("transient");
  });
});
