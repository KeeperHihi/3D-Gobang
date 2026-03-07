import { createMatchQueueGuide } from "../game/interaction/matchQueueGuide";

interface MatchPageProps {
  connectionStatus: "connecting" | "online" | "reconnecting" | "offline";
  matchPhase: "idle" | "queuing";
  queueSize: number;
  queueElapsedSeconds: number;
  isRecoveringSession: boolean;
  onStartMatch: () => void;
  onCancelMatch: () => void;
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
  isRecoveringSession,
  onStartMatch,
  onCancelMatch
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
        <button className="primary-button" type="button" onClick={onStartMatch} disabled={startDisabled}>
          {isRecoveringSession ? "正在恢复对局..." : isQueuing ? "正在匹配对手..." : "一键开始匹配"}
        </button>
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
