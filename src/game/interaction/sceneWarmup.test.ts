import { describe, expect, it } from "vitest";
import {
  sceneWarmupHint,
  sceneWarmupHintForMatchPage,
  sceneWarmupLoadingStageDetail
} from "./sceneWarmup";

describe("sceneWarmupHint", () => {
  it("returns idle guidance", () => {
    expect(sceneWarmupHint("idle")).toContain("尚未预热");
  });

  it("returns intent-only idle guidance on constrained network", () => {
    expect(sceneWarmupHint("idle", { intentOnlyMode: true })).toContain("操作后先预热房间壳");
  });

  it("returns warming guidance", () => {
    expect(sceneWarmupHint("warming")).toContain("预热房间壳");
  });

  it("returns board-stage warming guidance after room shell is ready", () => {
    expect(sceneWarmupHint("warming", { boardWarmupStatus: "warming" })).toContain(
      "房间壳已就绪，正在预热棋盘"
    );
  });

  it("returns ready guidance", () => {
    expect(sceneWarmupHint("ready")).toContain("已预热");
  });

  it("returns dual-stage ready guidance when board is preheated", () => {
    expect(sceneWarmupHint("ready", { boardWarmupStatus: "ready" })).toContain("房间壳与棋盘均已预热");
  });

  it("returns shell-only ready guidance when board preheat is skipped", () => {
    expect(sceneWarmupHint("ready", { boardWarmupStatus: "skipped" })).toContain("棋盘将按需加载");
  });

  it("returns failure fallback guidance", () => {
    expect(sceneWarmupHint("failed")).toContain("可一键重试");
  });

  it("returns board-preheat-specific failure guidance", () => {
    expect(sceneWarmupHint("failed", { boardWarmupStatus: "failed" })).toContain("棋盘预热失败");
  });

  it("returns auto-retrying guidance in queue retry window", () => {
    expect(sceneWarmupHint("failed", { autoRetrying: true })).toContain("自动重试预热");
  });
});

describe("sceneWarmupHintForMatchPage", () => {
  it("keeps retry hint when warmup-failed blocker allows retry", () => {
    expect(
      sceneWarmupHintForMatchPage("failed", {
        primaryBlockerSource: "warmup-failed",
        canRetryWarmup: true
      })
    ).toContain("可一键重试");
  });

  it("removes direct retry instruction when connection blocks retry", () => {
    const hint = sceneWarmupHintForMatchPage("failed", {
      primaryBlockerSource: "connection",
      canRetryWarmup: false
    });

    expect(hint).not.toContain("可一键重试");
    expect(hint).toContain("网络恢复后可重试预热");
  });

  it("uses recovery-aware hint when recovering blocks retry", () => {
    const hint = sceneWarmupHintForMatchPage("failed", {
      primaryBlockerSource: "recovering",
      canRetryWarmup: false,
      boardWarmupStatus: "failed"
    });

    expect(hint).not.toContain("可一键重试");
    expect(hint).toContain("恢复后可重试预热");
  });
});

describe("sceneWarmupLoadingStageDetail", () => {
  it("returns ready loading detail", () => {
    expect(sceneWarmupLoadingStageDetail("ready")).toContain("已预热");
  });

  it("returns dual-stage loading detail when board preheat is in progress", () => {
    expect(sceneWarmupLoadingStageDetail("warming", { boardWarmupStatus: "warming" })).toContain(
      "棋盘预热中"
    );
  });

  it("returns board-preheat failure loading detail", () => {
    expect(sceneWarmupLoadingStageDetail("failed", { boardWarmupStatus: "failed" })).toContain(
      "棋盘预热失败"
    );
  });

  it("returns failure loading detail with retry wording", () => {
    expect(sceneWarmupLoadingStageDetail("failed")).toContain("重试");
  });
});
