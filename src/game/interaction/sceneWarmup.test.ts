import { describe, expect, it } from "vitest";
import { sceneWarmupHint } from "./sceneWarmup";

describe("sceneWarmupHint", () => {
  it("returns idle guidance", () => {
    expect(sceneWarmupHint("idle")).toContain("准备");
  });

  it("returns warming guidance", () => {
    expect(sceneWarmupHint("warming")).toContain("预热 3D 战场");
  });

  it("returns ready guidance", () => {
    expect(sceneWarmupHint("ready")).toContain("已预热");
  });

  it("returns failure fallback guidance", () => {
    expect(sceneWarmupHint("failed")).toContain("预热失败");
  });
});
