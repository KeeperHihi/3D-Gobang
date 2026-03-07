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
}

export function createMatchQueueGuide(input: MatchQueueGuideInput): MatchQueueGuide {
  if (input.isRecoveringSession) {
    if (input.connectionStatus === "online") {
      return {
        headline: "正在恢复未完成对局",
        detail: "检测到上局仍在进行，系统正在自动恢复"
      };
    }

    return {
      headline: "等待恢复对局",
      detail: "检测到未完成对局，网络恢复后将自动重连"
    };
  }

  if (input.connectionStatus !== "online") {
    if (input.connectionStatus === "reconnecting") {
      return {
        headline: "网络重连中",
        detail: "正在尝试恢复连接，恢复后可继续匹配"
      };
    }
    if (input.connectionStatus === "connecting") {
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

  if (!input.isQueuing) {
    return {
      headline: "服务器在线，可立即匹配",
      detail: "点击一键开始匹配，系统会自动为你寻找对手"
    };
  }

  if (input.waitingSeconds < 10) {
    return {
      headline: "正在为你寻找对手",
      detail: "匹配进行中，通常很快就能进入对局"
    };
  }

  if (input.waitingSeconds < 20) {
    return {
      headline: "匹配稍有等待",
      detail: input.queueSize > 1 ? "队列较忙，建议再等待几秒" : "正在扩大匹配范围，请稍候"
    };
  }

  return {
    headline: "等待时间较长",
    detail: "你可以继续等待，或点击取消后稍后再试"
  };
}
