import type { MatchSecondaryActionState } from "./matchSecondaryActions";
import type { SceneWarmupStatus } from "./sceneWarmup";
import type { ConnectionStatus } from "./smartAction";

type MatchBlockerSource = "recovering" | "connection" | "queuing" | "warmup-failed";
type MatchBlockerOwner = "primary" | "cancel" | "retryWarmup";

interface BlockerCandidate {
  owner: MatchBlockerOwner;
  source: MatchBlockerSource;
  reason: string;
}

export interface MatchBlockerOrchestratorInput {
  connectionStatus: ConnectionStatus;
  isQueuing: boolean;
  isRecoveringSession: boolean;
  sceneWarmupStatus: SceneWarmupStatus;
  primaryActionDisabledReason: string | null;
  cancelAction: MatchSecondaryActionState;
  retryWarmupAction: MatchSecondaryActionState;
}

export interface MatchBlockerOrchestratorDecision {
  primaryBlockerReason: string | null;
  suppressPrimaryActionReason: boolean;
  suppressCancelReason: boolean;
  suppressRetryWarmupReason: boolean;
}

function resolvePrimarySource(
  input: MatchBlockerOrchestratorInput
): MatchBlockerSource | null {
  if (!input.primaryActionDisabledReason) {
    return null;
  }
  if (input.isRecoveringSession) {
    return "recovering";
  }
  if (input.connectionStatus !== "online") {
    return "connection";
  }
  if (input.isQueuing) {
    return "queuing";
  }
  if (input.sceneWarmupStatus === "failed") {
    return "warmup-failed";
  }
  return null;
}

function resolveCancelSource(
  input: MatchBlockerOrchestratorInput
): MatchBlockerSource | null {
  if (
    !input.cancelAction.visible ||
    input.cancelAction.enabled ||
    !input.cancelAction.disabledReason
  ) {
    return null;
  }
  if (input.isRecoveringSession) {
    return "recovering";
  }
  if (input.connectionStatus !== "online") {
    return "connection";
  }
  if (input.isQueuing) {
    return "queuing";
  }
  return null;
}

function resolveRetryWarmupSource(
  input: MatchBlockerOrchestratorInput
): MatchBlockerSource | null {
  if (
    !input.retryWarmupAction.visible ||
    input.retryWarmupAction.enabled ||
    !input.retryWarmupAction.disabledReason
  ) {
    return null;
  }
  if (input.isRecoveringSession) {
    return "recovering";
  }
  if (input.connectionStatus !== "online") {
    return "connection";
  }
  if (input.sceneWarmupStatus === "failed") {
    return "warmup-failed";
  }
  return null;
}

function sourcePriority(source: MatchBlockerSource): number {
  if (source === "recovering") {
    return 4;
  }
  if (source === "connection") {
    return 3;
  }
  if (source === "queuing") {
    return 2;
  }
  return 1;
}

function ownerPriority(owner: MatchBlockerOwner): number {
  if (owner === "primary") {
    return 3;
  }
  if (owner === "cancel") {
    return 2;
  }
  return 1;
}

function collectCandidates(input: MatchBlockerOrchestratorInput): BlockerCandidate[] {
  const candidates: BlockerCandidate[] = [];

  const primarySource = resolvePrimarySource(input);
  if (primarySource && input.primaryActionDisabledReason) {
    candidates.push({
      owner: "primary",
      source: primarySource,
      reason: input.primaryActionDisabledReason
    });
  }

  const cancelSource = resolveCancelSource(input);
  if (cancelSource && input.cancelAction.disabledReason) {
    candidates.push({
      owner: "cancel",
      source: cancelSource,
      reason: input.cancelAction.disabledReason
    });
  }

  const retryWarmupSource = resolveRetryWarmupSource(input);
  if (retryWarmupSource && input.retryWarmupAction.disabledReason) {
    candidates.push({
      owner: "retryWarmup",
      source: retryWarmupSource,
      reason: input.retryWarmupAction.disabledReason
    });
  }

  return candidates;
}

export function createMatchBlockerOrchestrator(
  input: MatchBlockerOrchestratorInput
): MatchBlockerOrchestratorDecision {
  const candidates = collectCandidates(input);
  if (candidates.length === 0) {
    return {
      primaryBlockerReason: null,
      suppressPrimaryActionReason: false,
      suppressCancelReason: false,
      suppressRetryWarmupReason: false
    };
  }

  const sorted = [...candidates].sort((left, right) => {
    const bySource = sourcePriority(right.source) - sourcePriority(left.source);
    if (bySource !== 0) {
      return bySource;
    }
    return ownerPriority(right.owner) - ownerPriority(left.owner);
  });
  const selected = sorted[0];

  return {
    primaryBlockerReason: selected.reason,
    suppressPrimaryActionReason: candidates.some(
      (candidate) => candidate.owner === "primary" && candidate.source === selected.source
    ),
    suppressCancelReason: candidates.some(
      (candidate) => candidate.owner === "cancel" && candidate.source === selected.source
    ),
    suppressRetryWarmupReason: candidates.some(
      (candidate) => candidate.owner === "retryWarmup" && candidate.source === selected.source
    )
  };
}
