export type SceneWarmupStatus = "idle" | "warming" | "ready" | "failed";
export type SceneWarmupBoardStatus = "idle" | "warming" | "ready" | "failed" | "skipped";

export interface SceneWarmupHintOptions {
  intentOnlyMode?: boolean;
  autoRetrying?: boolean;
  boardWarmupStatus?: SceneWarmupBoardStatus;
}

export function sceneWarmupHint(
  status: SceneWarmupStatus,
  options?: SceneWarmupHintOptions
): string {
  const boardWarmupStatus = options?.boardWarmupStatus ?? "idle";

  if (status === "ready") {
    if (boardWarmupStatus === "ready") {
      return "房间壳与棋盘均已预热，匹配成功后可更快开局。";
    }
    if (boardWarmupStatus === "skipped") {
      return "房间壳已预热；当前网络下棋盘将按需加载，匹配流程不受影响。";
    }
    return "战场已预热，匹配成功后可极速开局。";
  }

  if (status === "failed") {
    if (boardWarmupStatus === "failed") {
      if (options?.autoRetrying) {
        return "房间壳已就绪，但棋盘预热失败，正在自动重试。";
      }
      return "房间壳已就绪，但棋盘预热失败，可一键重试；进房后仍可继续加载。";
    }
    if (options?.autoRetrying) {
      return "战场预热失败，正在自动重试预热，请稍候。";
    }
    return "战场预热失败，可一键重试；即使直接匹配，进房时也会继续加载。";
  }

  if (status === "warming") {
    if (boardWarmupStatus === "warming") {
      return "房间壳已就绪，正在预热棋盘，匹配成功后可更快落子。";
    }
    return "正在预热房间壳，匹配成功后可更快进入对局。";
  }

  if (options?.intentOnlyMode) {
    return "当前网络偏弱或已开启省流量，将在你操作后先预热房间壳。";
  }

  return "战场尚未预热；开始匹配前可先准备房间壳与棋盘，减少等待。";
}

export function sceneWarmupLoadingStageDetail(
  status: SceneWarmupStatus,
  options?: {
    boardWarmupStatus?: SceneWarmupBoardStatus;
  }
): string {
  const boardWarmupStatus = options?.boardWarmupStatus ?? "idle";

  if (status === "ready") {
    if (boardWarmupStatus === "ready") {
      return "房间壳与棋盘已预热，正在接入房间...";
    }
    if (boardWarmupStatus === "skipped") {
      return "房间壳已预热，正在接入房间并按需加载棋盘...";
    }
    return "战场已预热，正在接入房间...";
  }
  if (status === "warming") {
    if (boardWarmupStatus === "warming") {
      return "房间壳已就绪，棋盘预热中，正在接入房间...";
    }
    return "房间壳预热中，正在接入房间...";
  }
  if (status === "failed") {
    if (boardWarmupStatus === "failed") {
      return "棋盘预热失败，正在重试并接入房间...";
    }
    return "预热曾失败，正在重试并接入房间...";
  }
  return "3D 场景加载中，正在接入房间...";
}
