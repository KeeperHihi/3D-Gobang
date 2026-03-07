export type SceneWarmupStatus = "idle" | "warming" | "ready" | "failed";

export function sceneWarmupHint(status: SceneWarmupStatus): string {
  if (status === "ready") {
    return "战场已预热，匹配成功后将极速开局。";
  }

  if (status === "failed") {
    return "战场预热失败，匹配成功后将自动继续加载。";
  }

  if (status === "warming") {
    return "正在预热 3D 战场，匹配成功后可更快进入对局。";
  }

  return "正在准备战场预热资源...";
}
