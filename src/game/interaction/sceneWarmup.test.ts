import { describe, expect, it } from "vitest";
import { sceneWarmupHint, sceneWarmupLoadingStageDetail } from "./sceneWarmup";

describe("sceneWarmupHint", () => {
  it("returns idle guidance", () => {
    expect(sceneWarmupHint("idle")).toContain("尚未预热");
  });

  it("returns warming guidance", () => {
    expect(sceneWarmupHint("warming")).toContain("预热 3D 战场");
  });

  it("returns ready guidance", () => {
    expect(sceneWarmupHint("ready")).toContain("已预热");
  });

  it("returns failure fallback guidance", () => {
    expect(sceneWarmupHint("failed")).toContain("可一键重试");
  });
});

describe("sceneWarmupLoadingStageDetail", () => {
  it("returns ready loading detail", () => {
    expect(sceneWarmupLoadingStageDetail("ready")).toContain("已预热");
  });

  it("returns failure loading detail with retry wording", () => {
    expect(sceneWarmupLoadingStageDetail("failed")).toContain("重试");
  });
});
