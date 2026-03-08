export type ConnectionGuidanceStatus = "connecting" | "online" | "reconnecting" | "offline";

export interface ConnectionGuidanceInput {
  connectionStatus: ConnectionGuidanceStatus;
  canObserveBoard: boolean;
}

export interface ConnectionGuidanceDecision {
  primaryHint: string | null;
  secondaryHint: string | null;
}

const OBSERVATION_HINT = "可点击棋盘切层观察";

function createReconnectHint(canObserveBoard: boolean): string {
  const base = "网络重连中，请稍候";
  return canObserveBoard ? `${base}，${OBSERVATION_HINT}` : base;
}

function createOfflineHint(canObserveBoard: boolean): string {
  const base = "当前离线，暂不可操作";
  return canObserveBoard ? `${base}，${OBSERVATION_HINT}` : base;
}

function createConnectingHint(): string {
  return "正在连接服务器";
}

export function evaluateConnectionGuidance(
  input: ConnectionGuidanceInput
): ConnectionGuidanceDecision {
  if (input.connectionStatus === "online") {
    return {
      primaryHint: null,
      secondaryHint: null
    };
  }

  if (input.connectionStatus === "connecting") {
    const hint = createConnectingHint();
    return {
      primaryHint: hint,
      secondaryHint: hint
    };
  }

  if (input.connectionStatus === "reconnecting") {
    const hint = createReconnectHint(input.canObserveBoard);
    return {
      primaryHint: hint,
      secondaryHint: hint
    };
  }

  const hint = createOfflineHint(input.canObserveBoard);
  return {
    primaryHint: hint,
    secondaryHint: hint
  };
}
