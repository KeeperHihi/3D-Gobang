import { lazy } from "react";

type BoardSceneModule = typeof import("./BoardScene");
type BoardSceneModuleLoader = () => Promise<BoardSceneModule>;

let boardSceneModulePromise: Promise<BoardSceneModule> | null = null;
let boardSceneModuleLoader: BoardSceneModuleLoader = () => import("./BoardScene");

export function loadBoardSceneModule(): Promise<BoardSceneModule> {
  if (boardSceneModulePromise !== null) {
    return boardSceneModulePromise;
  }
  boardSceneModulePromise = boardSceneModuleLoader().catch((error) => {
    boardSceneModulePromise = null;
    throw error;
  });
  return boardSceneModulePromise;
}

export function preloadBoardScene(): Promise<void> {
  return loadBoardSceneModule().then(() => undefined);
}

export function createLazyBoardScene() {
  return lazy(() =>
    loadBoardSceneModule().then((module) => ({
      default: module.BoardScene
    }))
  );
}

export function resetBoardSceneLoaderForTests(options?: {
  loader?: BoardSceneModuleLoader;
}): void {
  boardSceneModulePromise = null;
  boardSceneModuleLoader = options?.loader ?? (() => import("./BoardScene"));
}
