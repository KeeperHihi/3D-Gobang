export type ConnectionGuidanceStatus = "connecting" | "online" | "reconnecting" | "offline";
export type ConnectionSpotlightTone = "critical" | "info";

export interface ConnectionGuidanceInput {
  connectionStatus: ConnectionGuidanceStatus;
  canObserveBoard: boolean;
}

export interface ConnectionSemanticDecision {
  statusLabel: string;
  actionLabel: string;
  spotlightTone: ConnectionSpotlightTone;
  spotlightPriority: number;
}

export interface ConnectionGuidanceDecision {
  primaryHint: string | null;
  secondaryHint: string | null;
  statusLabel: string;
  actionLabel: string;
  spotlightTone: ConnectionSpotlightTone;
  spotlightPriority: number;
}

const OBSERVATION_HINT = "可点击棋盘切层观察";
const CONNECTING_PRIORITY = 36;
const RECONNECTING_PRIORITY = 92;
const OFFLINE_PRIORITY = 100;

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

export function evaluateConnectionSemantic(
  connectionStatus: ConnectionGuidanceStatus
): ConnectionSemanticDecision {
  if (connectionStatus === "online") {
    return {
      statusLabel: "在线",
      actionLabel: "在线",
      spotlightTone: "info",
      spotlightPriority: 0
    };
  }

  if (connectionStatus === "connecting") {
    return {
      statusLabel: "连接中",
      actionLabel: "连接中",
      spotlightTone: "info",
      spotlightPriority: CONNECTING_PRIORITY
    };
  }

  if (connectionStatus === "reconnecting") {
    return {
      statusLabel: "重连中",
      actionLabel: "重连中",
      spotlightTone: "critical",
      spotlightPriority: RECONNECTING_PRIORITY
    };
  }

  return {
    statusLabel: "离线",
    actionLabel: "离线中",
    spotlightTone: "critical",
    spotlightPriority: OFFLINE_PRIORITY
  };
}

export function evaluateConnectionGuidance(
  input: ConnectionGuidanceInput
): ConnectionGuidanceDecision {
  const semantic = evaluateConnectionSemantic(input.connectionStatus);
  if (input.connectionStatus === "online") {
    return {
      primaryHint: null,
      secondaryHint: null,
      ...semantic
    };
  }

  if (input.connectionStatus === "connecting") {
    const hint = createConnectingHint();
    return {
      primaryHint: hint,
      secondaryHint: hint,
      ...semantic
    };
  }

  if (input.connectionStatus === "reconnecting") {
    const hint = createReconnectHint(input.canObserveBoard);
    return {
      primaryHint: hint,
      secondaryHint: hint,
      ...semantic
    };
  }

  const hint = createOfflineHint(input.canObserveBoard);
  return {
    primaryHint: hint,
    secondaryHint: hint,
    ...semantic
  };
}
