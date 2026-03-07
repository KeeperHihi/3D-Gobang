import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadBoardSceneModule,
  preloadBoardScene,
  resetBoardSceneLoaderForTests
} from "./boardSceneLoader";

type BoardSceneModule = typeof import("./BoardScene");

function createBoardSceneModuleStub(): BoardSceneModule {
  return {
    BoardScene: (() => null) as BoardSceneModule["BoardScene"]
  };
}

describe("boardSceneLoader", () => {
  afterEach(() => {
    resetBoardSceneLoaderForTests();
  });

  it("shares the same in-flight module request", async () => {
    const moduleStub = createBoardSceneModuleStub();
    const loader = vi.fn<[], Promise<BoardSceneModule>>().mockResolvedValue(moduleStub);
    resetBoardSceneLoaderForTests({ loader });

    const [first, second] = await Promise.all([loadBoardSceneModule(), loadBoardSceneModule()]);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(first).toBe(moduleStub);
    expect(second).toBe(moduleStub);
  });

  it("allows retry after a failed module request", async () => {
    const moduleStub = createBoardSceneModuleStub();
    const loader = vi
      .fn<[], Promise<BoardSceneModule>>()
      .mockRejectedValueOnce(new Error("chunk-load-failed"))
      .mockResolvedValueOnce(moduleStub);
    resetBoardSceneLoaderForTests({ loader });

    await expect(loadBoardSceneModule()).rejects.toThrow("chunk-load-failed");
    await expect(preloadBoardScene()).resolves.toBeUndefined();

    expect(loader).toHaveBeenCalledTimes(2);
  });
});
