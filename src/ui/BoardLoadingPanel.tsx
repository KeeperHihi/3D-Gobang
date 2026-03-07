interface BoardLoadingPanelProps {
  state: "loading" | "failed";
  onRetry?: () => void;
}

export function BoardLoadingPanel({ state, onRetry }: BoardLoadingPanelProps) {
  const loading = state === "loading";

  return (
    <div className={`board-loading-panel ${loading ? "loading" : "failed"}`}>
      <div className="board-loading-panel-card">
        <p className="board-loading-panel-kicker">ROOM SHELL FIRST</p>
        <h3>{loading ? "棋盘正在部署" : "棋盘加载失败"}</h3>
        <p>
          {loading
            ? "房间状态已就绪，你可以先查看回合与连接信息。棋盘完成后立即可落子。"
            : "房间壳仍可正常显示。请重试加载棋盘，或稍后继续。"}
        </p>
        {loading ? (
          <div className="board-loading-pulse-track" aria-hidden="true">
            <span className="board-loading-pulse-dot" />
            <span className="board-loading-pulse-dot" />
            <span className="board-loading-pulse-dot" />
          </div>
        ) : (
          <button className="board-loading-retry" type="button" onClick={onRetry}>
            重试加载棋盘
          </button>
        )}
      </div>
    </div>
  );
}
