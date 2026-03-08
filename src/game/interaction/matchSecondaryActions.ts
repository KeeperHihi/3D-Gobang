import { evaluateConnectionSemantic } from "./connectionGuidance";
import type { SceneWarmupStatus } from "./sceneWarmup";
import type { ConnectionStatus } from "./smartAction";

export interface MatchSecondaryActionsInput {
  connectionStatus: ConnectionStatus;
  isQueuing: boolean;
  isRecoveringSession: boolean;
  sceneWarmupStatus: SceneWarmupStatus;
}

export interface MatchSecondaryActionState {
  visible: boolean;
  label: string;
  enabled: boolean;
  disabledReason: string | null;
}

export interface MatchSecondaryActionsDecision {
  cancelAction: MatchSecondaryActionState;
  retryWarmupAction: MatchSecondaryActionState;
}

function resolveCancelAction(
  input: MatchSecondaryActionsInput
): MatchSecondaryActionState {
  const visible = input.isQueuing;
  const label = "一键取消匹配";
  if (!visible) {
    return {
      visible,
      label,
      enabled: false,
      disabledReason: null
    };
  }

  if (input.isRecoveringSession) {
    return {
      visible,
      label,
      enabled: false,
      disabledReason: "正在恢复对局，暂不可取消匹配"
    };
  }

  if (input.connectionStatus !== "online") {
    const connectionSemantic = evaluateConnectionSemantic(input.connectionStatus);
    return {
      visible,
      label,
      enabled: false,
      disabledReason: `${connectionSemantic.statusLabel}，连接恢复后可取消匹配`
    };
  }

  return {
    visible,
    label,
    enabled: true,
    disabledReason: null
  };
}

function resolveRetryWarmupAction(
  input: MatchSecondaryActionsInput
): MatchSecondaryActionState {
  const visible = input.sceneWarmupStatus === "failed";
  const label = "一键重试预热";
  if (!visible) {
    return {
      visible,
      label,
      enabled: false,
      disabledReason: null
    };
  }

  if (input.isRecoveringSession) {
    return {
      visible,
      label,
      enabled: false,
      disabledReason: "正在恢复对局，恢复完成后可重试预热"
    };
  }

  if (input.connectionStatus !== "online") {
    const connectionSemantic = evaluateConnectionSemantic(input.connectionStatus);
    return {
      visible,
      label,
      enabled: false,
      disabledReason: `${connectionSemantic.statusLabel}，连接恢复后可重试预热`
    };
  }

  return {
    visible,
    label,
    enabled: true,
    disabledReason: null
  };
}

export function createMatchSecondaryActions(
  input: MatchSecondaryActionsInput
): MatchSecondaryActionsDecision {
  return {
    cancelAction: resolveCancelAction(input),
    retryWarmupAction: resolveRetryWarmupAction(input)
  };
}
