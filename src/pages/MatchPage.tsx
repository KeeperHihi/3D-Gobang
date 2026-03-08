import { createMatchQueueGuide } from "../game/interaction/matchQueueGuide";
import { createMatchBlockerOrchestrator } from "../game/interaction/matchBlockerOrchestrator";
import { createMatchSecondaryActions } from "../game/interaction/matchSecondaryActions";
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
  const secondaryActions = createMatchSecondaryActions({
    connectionStatus,
    isQueuing,
    isRecoveringSession,
    sceneWarmupStatus
  });
  const blockerDecision = createMatchBlockerOrchestrator({
    connectionStatus,
    isQueuing,
    isRecoveringSession,
    sceneWarmupStatus,
    primaryActionDisabledReason: guide.primaryActionDisabledReason,
    cancelAction: secondaryActions.cancelAction,
    retryWarmupAction: secondaryActions.retryWarmupAction
  });
  const startDisabled = guide.primaryActionDisabledReason !== null;
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
          {guide.primaryActionLabel}
        </button>
        {blockerDecision.primaryBlockerReason ? (
          <p className="match-primary-blocker-reason">{blockerDecision.primaryBlockerReason}</p>
        ) : null}
        {secondaryActions.retryWarmupAction.visible ? (
          <div className="match-warmup-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={onRetryWarmup}
              disabled={!secondaryActions.retryWarmupAction.enabled}
            >
              {secondaryActions.retryWarmupAction.label}
            </button>
            {!secondaryActions.retryWarmupAction.enabled &&
            secondaryActions.retryWarmupAction.disabledReason &&
            !blockerDecision.suppressRetryWarmupReason ? (
              <p className="match-secondary-disabled-reason">
                {secondaryActions.retryWarmupAction.disabledReason}
              </p>
            ) : null}
          </div>
        ) : null}
        {isWarmupAutoRetrying ? (
          <p className="match-warmup-retrying">正在自动重试预热...</p>
        ) : null}
        {secondaryActions.cancelAction.visible ? (
          <button
            className="secondary-button"
            type="button"
            onClick={onCancelMatch}
            disabled={!secondaryActions.cancelAction.enabled}
          >
            {secondaryActions.cancelAction.label}
          </button>
        ) : null}
        {secondaryActions.cancelAction.visible &&
        !secondaryActions.cancelAction.enabled &&
        secondaryActions.cancelAction.disabledReason &&
        !blockerDecision.suppressCancelReason ? (
          <p className="match-secondary-disabled-reason">
            {secondaryActions.cancelAction.disabledReason}
          </p>
        ) : null}
      </div>
    </main>
  );
}
