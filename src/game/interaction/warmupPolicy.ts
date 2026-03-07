import type { SceneWarmupStatus } from "./sceneWarmup";

export type WarmupPolicyConnectionStatus = "connecting" | "online" | "reconnecting" | "offline";
export type WarmupPolicyMatchPhase = "idle" | "queuing" | "matched";
export type WarmupEffectiveType = "slow-2g" | "2g" | "3g" | "4g" | "unknown";

export interface WarmupPolicyInput {
  connectionStatus: WarmupPolicyConnectionStatus;
  matchPhase: WarmupPolicyMatchPhase;
  sceneWarmupStatus: SceneWarmupStatus;
  effectiveType: WarmupEffectiveType;
  saveData: boolean;
  pageVisible: boolean;
  hasUserIntent: boolean;
  retryCount: number;
}

export interface WarmupPolicyDecision {
  shouldAutoWarmup: boolean;
  shouldRetryWarmup: boolean;
  retryDelayMs: number | null;
  intentOnlyMode: boolean;
}

export const WARMUP_RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;

export function normalizeWarmupEffectiveType(
  effectiveType: string | null | undefined
): WarmupEffectiveType {
  if (
    effectiveType === "slow-2g" ||
    effectiveType === "2g" ||
    effectiveType === "3g" ||
    effectiveType === "4g"
  ) {
    return effectiveType;
  }
  return "unknown";
}

function isIntentOnlyNetwork(input: Pick<WarmupPolicyInput, "effectiveType" | "saveData">): boolean {
  if (input.saveData) {
    return true;
  }
  return (
    input.effectiveType === "slow-2g" ||
    input.effectiveType === "2g" ||
    input.effectiveType === "3g"
  );
}

export function evaluateWarmupPolicy(input: WarmupPolicyInput): WarmupPolicyDecision {
  const intentOnlyMode = isIntentOnlyNetwork(input);
  const isOnline = input.connectionStatus === "online";
  const canOperate = isOnline && input.pageVisible && input.matchPhase !== "matched";
  const retryDelayMs =
    input.retryCount >= 0 && input.retryCount < WARMUP_RETRY_DELAYS_MS.length
      ? WARMUP_RETRY_DELAYS_MS[input.retryCount]
      : null;

  if (!canOperate || input.sceneWarmupStatus === "ready" || input.sceneWarmupStatus === "warming") {
    return {
      shouldAutoWarmup: false,
      shouldRetryWarmup: false,
      retryDelayMs: null,
      intentOnlyMode
    };
  }

  if (input.sceneWarmupStatus === "failed") {
    if (input.hasUserIntent) {
      return {
        shouldAutoWarmup: true,
        shouldRetryWarmup: false,
        retryDelayMs: null,
        intentOnlyMode
      };
    }

    const shouldRetryWarmup =
      input.matchPhase === "queuing" &&
      retryDelayMs !== null &&
      input.retryCount < WARMUP_RETRY_DELAYS_MS.length;
    return {
      shouldAutoWarmup: false,
      shouldRetryWarmup,
      retryDelayMs: shouldRetryWarmup ? retryDelayMs : null,
      intentOnlyMode
    };
  }

  if (input.hasUserIntent) {
    return {
      shouldAutoWarmup: true,
      shouldRetryWarmup: false,
      retryDelayMs: null,
      intentOnlyMode
    };
  }

  if (input.matchPhase === "queuing") {
    return {
      shouldAutoWarmup: true,
      shouldRetryWarmup: false,
      retryDelayMs: null,
      intentOnlyMode
    };
  }

  if (input.matchPhase === "idle" && !intentOnlyMode) {
    return {
      shouldAutoWarmup: true,
      shouldRetryWarmup: false,
      retryDelayMs: null,
      intentOnlyMode
    };
  }

  return {
    shouldAutoWarmup: false,
    shouldRetryWarmup: false,
    retryDelayMs: null,
    intentOnlyMode
  };
}
