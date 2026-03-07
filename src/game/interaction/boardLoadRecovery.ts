export const BOARD_LOAD_AUTO_RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;

export type BoardLoadErrorKind = "transient" | "unrecoverable_chunk";
export type BoardLoadRecoveryStatus =
  | "auto-retrying"
  | "manual-only"
  | "offline"
  | "refresh-required";

export interface BoardLoadRecoveryInput {
  failedAutoRetryCount: number;
  isOnline: boolean;
  errorKind?: BoardLoadErrorKind;
  retryDelaysMs?: readonly number[];
}

export interface BoardLoadRecoveryDecision {
  shouldAutoRetry: boolean;
  nextRetryDelayMs: number | null;
  nextAttempt: number;
  maxAutoRetryCount: number;
  status: BoardLoadRecoveryStatus;
}

const UNRECOVERABLE_CHUNK_ERROR_PATTERNS = [
  /chunkloaderror/i,
  /failed to fetch dynamically imported module/i,
  /loading chunk[\s\S]*failed/i,
  /importing a module script failed/i,
  /error loading dynamically imported module/i
];

function readErrorText(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return `${error.name} ${error.message}`;
  }

  if (typeof error === "object" && error !== null) {
    const maybeName = "name" in error ? String((error as { name?: unknown }).name ?? "") : "";
    const maybeMessage =
      "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
    const maybeReason = "reason" in error ? String((error as { reason?: unknown }).reason ?? "") : "";
    return `${maybeName} ${maybeMessage} ${maybeReason}`;
  }

  return "";
}

export function classifyBoardLoadError(error: unknown): BoardLoadErrorKind {
  const errorText = readErrorText(error);
  if (!errorText) {
    return "transient";
  }

  for (const pattern of UNRECOVERABLE_CHUNK_ERROR_PATTERNS) {
    if (pattern.test(errorText)) {
      return "unrecoverable_chunk";
    }
  }
  return "transient";
}

export function evaluateBoardLoadRecovery(
  input: BoardLoadRecoveryInput
): BoardLoadRecoveryDecision {
  const retryDelaysMs = input.retryDelaysMs ?? BOARD_LOAD_AUTO_RETRY_DELAYS_MS;
  const maxAutoRetryCount = retryDelaysMs.length;
  const failedAutoRetryCount = Math.max(0, input.failedAutoRetryCount);
  const nextAttempt = Math.min(maxAutoRetryCount, failedAutoRetryCount + 1);
  const errorKind = input.errorKind ?? "transient";

  if (errorKind === "unrecoverable_chunk") {
    return {
      shouldAutoRetry: false,
      nextRetryDelayMs: null,
      nextAttempt,
      maxAutoRetryCount,
      status: "refresh-required"
    };
  }

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
