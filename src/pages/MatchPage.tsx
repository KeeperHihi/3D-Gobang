import { createMatchQueueGuide } from "../game/interaction/matchQueueGuide";
import {
  sceneWarmupHint,
  type SceneWarmupBoardStatus,
  type SceneWarmupStatus
} from "../game/interaction/sceneWarmup";

interface MatchPageProps {
  connectionStatus: "connecting" | "online" | "reconnecting" | "offline";
  matchPhase: "idle" | "queuing";
  queueSize: number;
  queueElapsedSeconds: number;
  sceneWarmupStatus: SceneWarmupStatus;
  sceneWarmupBoardStatus: SceneWarmupBoardStatus;
  warmupIntentOnlyMode: boolean;
  isWarmupAutoRetrying: boolean;
  isRecoveringSession: boolean;
  onStartMatch: () => void;
  onCancelMatch: () => void;
  onPrepareArena: () => void;
  onRetryWarmup: () => void;
}

function formatWaitTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function MatchPage({
  connectionStatus,
  matchPhase,
  queueSize,
  queueElapsedSeconds,
  sceneWarmupStatus,
  sceneWarmupBoardStatus,
  warmupIntentOnlyMode,
  isWarmupAutoRetrying,
  isRecoveringSession,
  onStartMatch,
  onCancelMatch,
  onPrepareArena,
  onRetryWarmup
}: MatchPageProps) {
  const isQueuing = matchPhase === "queuing";
  const guide = createMatchQueueGuide({
    connectionStatus,
    isQueuing,
    isRecoveringSession,
    waitingSeconds: queueElapsedSeconds,
    queueSize
  });
  const startDisabled = connectionStatus !== "online" || isQueuing || isRecoveringSession;
  const cancelDisabled = connectionStatus !== "online" || !isQueuing || isRecoveringSession;
  const retryWarmupDisabled =
    connectionStatus !== "online" || sceneWarmupStatus !== "failed" || isRecoveringSession;
  const warmupHint = sceneWarmupHint(sceneWarmupStatus, {
    intentOnlyMode: warmupIntentOnlyMode,
    autoRetrying: isWarmupAutoRetrying,
    boardWarmupStatus: sceneWarmupBoardStatus
  });

  return (
    <main className="match-page">
      <div className="match-background-grid" />
      <div className="match-card">
        <p className="match-kicker">3D 联机对战</p>
        <h1>Nebula Cube 五子棋</h1>
        <p className="match-subtitle">
          旋转立方体，点击发光空位即可落子。任意空间方向连成 5 子立即获胜。
        </p>
        <p className="match-status">{guide.headline}</p>
        <p className="match-queue-guide">{guide.detail}</p>
        {isQueuing ? (
          <div className="match-queue-panel">
            <div className="match-queue-stat">
              <span>已等待</span>
              <strong>{formatWaitTime(queueElapsedSeconds)}</strong>
            </div>
            <div className="match-queue-stat">
              <span>队列规模</span>
              <strong>{Math.max(queueSize, 1)} 人</strong>
            </div>
          </div>
        ) : null}
        <p className={`match-warmup-status ${sceneWarmupStatus}`}>{warmupHint}</p>
        <button
          className="primary-button"
          type="button"
          onClick={onStartMatch}
          onPointerEnter={onPrepareArena}
          onFocus={onPrepareArena}
          onTouchStart={onPrepareArena}
          disabled={startDisabled}
        >
          {isRecoveringSession ? "正在恢复对局..." : isQueuing ? "正在匹配对手..." : "一键开始匹配"}
        </button>
        {sceneWarmupStatus === "failed" ? (
          <div className="match-warmup-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={onRetryWarmup}
              disabled={retryWarmupDisabled}
            >
              一键重试预热
            </button>
          </div>
        ) : null}
        {isWarmupAutoRetrying ? (
          <p className="match-warmup-retrying">正在自动重试预热...</p>
        ) : null}
        {isQueuing ? (
          <button
            className="secondary-button"
            type="button"
            onClick={onCancelMatch}
            disabled={cancelDisabled}
          >
            一键取消匹配
          </button>
        ) : null}
      </div>
    </main>
  );
}
