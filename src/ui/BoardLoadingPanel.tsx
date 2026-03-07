import type { BoardLoadRecoveryStatus } from "../game/interaction/boardLoadRecovery";

interface BoardLoadingPanelProps {
  state: "loading" | "failed";
  onRetry?: () => void;
  autoRetrying?: boolean;
  autoRetryNextAttempt?: number;
  autoRetryAttemptedCount?: number;
  autoRetryMaxAttempts?: number;
  autoRetryRemainingMs?: number | null;
  recoveryStatus?: BoardLoadRecoveryStatus;
}

function formatRetryCountdownLabel(remainingMs: number | null | undefined): string | null {
  if (remainingMs === null || remainingMs === undefined) {
    return null;
  }
  const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
  return `${seconds} 秒后重试`;
}

export function BoardLoadingPanel({
  state,
  onRetry,
  autoRetrying = false,
  autoRetryNextAttempt = 1,
  autoRetryAttemptedCount = 0,
  autoRetryMaxAttempts = 3,
  autoRetryRemainingMs = null,
  recoveryStatus = "manual-only"
}: BoardLoadingPanelProps) {
  const loading = state === "loading";
  const retryCountdownLabel = formatRetryCountdownLabel(autoRetryRemainingMs);
  const hasAutoRetryHistory = autoRetryAttemptedCount > 0;

  return (
    <div className={`board-loading-panel ${loading ? "loading" : "failed"}`}>
      <div className="board-loading-panel-card">
        <p className="board-loading-panel-kicker">ROOM SHELL FIRST</p>
        <h3>{loading ? "棋盘正在部署" : autoRetrying ? "棋盘加载失败，正在自动重试" : "棋盘加载失败"}</h3>
        <p>
          {loading
            ? "房间状态已就绪，你可以先查看回合与连接信息。棋盘完成后立即可落子。"
            : autoRetrying
              ? `网络波动，系统正在自动恢复（第 ${autoRetryNextAttempt} / ${autoRetryMaxAttempts} 次）。`
              : recoveryStatus === "offline"
                ? "当前网络离线，自动重试已暂停。恢复网络后会继续；也可立即手动重试。"
                : hasAutoRetryHistory
                  ? `已完成 ${autoRetryAttemptedCount} 次自动重试。你可以手动立即重试。`
                  : "房间壳仍可正常显示。请重试加载棋盘，或稍后继续。"}
        </p>
        {!loading && autoRetrying ? (
          <p className="board-loading-recovery-meta">
            {retryCountdownLabel ? `下一次自动重试：${retryCountdownLabel}` : "正在安排下一次自动重试..."}
          </p>
        ) : null}
        {loading ? (
          <div className="board-loading-pulse-track" aria-hidden="true">
            <span className="board-loading-pulse-dot" />
            <span className="board-loading-pulse-dot" />
            <span className="board-loading-pulse-dot" />
          </div>
        ) : (
          <button className="board-loading-retry" type="button" onClick={onRetry}>
            {autoRetrying ? "立即重试" : "重试加载棋盘"}
          </button>
        )}
      </div>
    </div>
  );
}
