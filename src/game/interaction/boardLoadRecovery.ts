export const BOARD_LOAD_AUTO_RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;

export type BoardLoadRecoveryStatus = "auto-retrying" | "manual-only" | "offline";

export interface BoardLoadRecoveryInput {
  failedAutoRetryCount: number;
  isOnline: boolean;
  retryDelaysMs?: readonly number[];
}

export interface BoardLoadRecoveryDecision {
  shouldAutoRetry: boolean;
  nextRetryDelayMs: number | null;
  nextAttempt: number;
  maxAutoRetryCount: number;
  status: BoardLoadRecoveryStatus;
}

export function evaluateBoardLoadRecovery(
  input: BoardLoadRecoveryInput
): BoardLoadRecoveryDecision {
  const retryDelaysMs = input.retryDelaysMs ?? BOARD_LOAD_AUTO_RETRY_DELAYS_MS;
  const maxAutoRetryCount = retryDelaysMs.length;
  const failedAutoRetryCount = Math.max(0, input.failedAutoRetryCount);
  const nextAttempt = Math.min(maxAutoRetryCount, failedAutoRetryCount + 1);
  const nextRetryDelayMs =
    failedAutoRetryCount >= 0 && failedAutoRetryCount < retryDelaysMs.length
      ? retryDelaysMs[failedAutoRetryCount]
      : null;

  if (nextRetryDelayMs === null) {
    return {
      shouldAutoRetry: false,
      nextRetryDelayMs: null,
      nextAttempt: maxAutoRetryCount,
      maxAutoRetryCount,
      status: "manual-only"
    };
  }

  if (!input.isOnline) {
    return {
      shouldAutoRetry: false,
      nextRetryDelayMs: null,
      nextAttempt,
      maxAutoRetryCount,
      status: "offline"
    };
  }

  return {
    shouldAutoRetry: true,
    nextRetryDelayMs,
    nextAttempt,
    maxAutoRetryCount,
    status: "auto-retrying"
  };
}
