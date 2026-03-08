import { evaluateConnectionSemantic } from "./connectionGuidance";
import type { ConnectionStatus } from "./smartAction";

export interface MatchQueueGuideInput {
  connectionStatus: ConnectionStatus;
  isQueuing: boolean;
  isRecoveringSession: boolean;
  waitingSeconds: number;
  queueSize: number;
}

export interface MatchQueueGuide {
  headline: string;
  detail: string;
  primaryActionLabel: string;
  primaryActionDisabledReason: string | null;
}

function resolveConnectionGuide(
  connectionStatus: ConnectionStatus
): Pick<MatchQueueGuide, "headline" | "detail"> {
  if (connectionStatus === "reconnecting") {
    return {
      headline: "网络重连中",
      detail: "正在尝试恢复连接，恢复后可继续匹配"
    };
  }
  if (connectionStatus === "connecting") {
    return {
      headline: "正在连接服务器",
      detail: "连接完成后即可一键开始匹配"
    };
  }
  return {
    headline: "当前离线",
    detail: "请等待网络恢复后再开始匹配"
  };
}

export function createMatchQueueGuide(input: MatchQueueGuideInput): MatchQueueGuide {
  const connectionSemantic = evaluateConnectionSemantic(input.connectionStatus);

  if (input.isRecoveringSession) {
    if (input.connectionStatus === "online") {
      return {
        headline: "正在恢复未完成对局",
        detail: "检测到上局仍在进行，系统正在自动恢复",
        primaryActionLabel: "正在恢复对局...",
        primaryActionDisabledReason: "检测到未完成对局，恢复完成前不可开始新匹配"
      };
    }

    return {
      headline: "等待恢复对局",
      detail: "检测到未完成对局，网络恢复后将自动重连",
      primaryActionLabel: "正在恢复对局...",
      primaryActionDisabledReason: `${connectionSemantic.statusLabel}，恢复后将自动继续`
    };
  }

  if (input.isQueuing) {
    if (input.connectionStatus !== "online") {
      const connectionGuide = resolveConnectionGuide(input.connectionStatus);
      return {
        headline: connectionGuide.headline,
        detail: connectionGuide.detail,
        primaryActionLabel: "正在匹配对手...",
        primaryActionDisabledReason: `${connectionSemantic.statusLabel}，匹配将在连接恢复后继续`
      };
    }

    if (input.waitingSeconds < 10) {
      return {
        headline: "正在为你寻找对手",
        detail: "匹配进行中，通常很快就能进入对局",
        primaryActionLabel: "正在匹配对手...",
        primaryActionDisabledReason: "匹配进行中，如需离开可点击“一键取消匹配”"
      };
    }

    if (input.waitingSeconds < 20) {
      return {
        headline: "匹配稍有等待",
        detail: input.queueSize > 1 ? "队列较忙，建议再等待几秒" : "正在扩大匹配范围，请稍候",
        primaryActionLabel: "正在匹配对手...",
        primaryActionDisabledReason: "正在扩大匹配范围，暂不可重复发起匹配"
      };
    }

    return {
      headline: "等待时间较长",
      detail: "你可以继续等待，或点击取消后稍后再试",
      primaryActionLabel: "正在匹配对手...",
      primaryActionDisabledReason: "当前仍在匹配中，可取消后稍后重试"
    };
  }

  if (input.connectionStatus !== "online") {
    const connectionGuide = resolveConnectionGuide(input.connectionStatus);
    return {
      headline: connectionGuide.headline,
      detail: connectionGuide.detail,
      primaryActionLabel: connectionSemantic.actionLabel,
      primaryActionDisabledReason: "连接恢复后即可开始匹配"
    };
  }

  return {
    headline: "服务器在线，可立即匹配",
    detail: "点击一键开始匹配，系统会自动为你寻找对手",
    primaryActionLabel: "一键开始匹配",
    primaryActionDisabledReason: null
  };
}
