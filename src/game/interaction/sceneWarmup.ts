export type SceneWarmupStatus = "idle" | "warming" | "ready" | "failed";

export function sceneWarmupHint(status: SceneWarmupStatus): string {
  if (status === "ready") {
    return "战场已预热，匹配成功后可极速开局。";
  }

  if (status === "failed") {
    return "战场预热失败，可一键重试；即使直接匹配，进房时也会继续加载。";
  }

  if (status === "warming") {
    return "正在预热 3D 战场，匹配成功后可更快进入对局。";
  }

  return "战场尚未预热；开始匹配前可先准备，以减少进房等待。";
}

export function sceneWarmupLoadingStageDetail(status: SceneWarmupStatus): string {
  if (status === "ready") {
    return "战场已预热，正在接入房间...";
  }
  if (status === "warming") {
    return "战场预热即将完成，正在接入房间...";
  }
  if (status === "failed") {
    return "预热曾失败，正在重试并接入房间...";
  }
  return "3D 场景加载中，正在接入房间...";
}
