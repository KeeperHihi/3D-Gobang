import { describe, expect, it } from "vitest";
import {
  BOARD_LOAD_AUTO_RETRY_DELAYS_MS,
  evaluateBoardLoadRecovery
} from "./boardLoadRecovery";

describe("evaluateBoardLoadRecovery", () => {
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
