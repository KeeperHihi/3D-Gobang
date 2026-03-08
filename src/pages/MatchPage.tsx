import { createMatchQueueGuide } from "../game/interaction/matchQueueGuide";
import { createMatchBlockerOrchestrator } from "../game/interaction/matchBlockerOrchestrator";
import { createMatchSecondaryActions } from "../game/interaction/matchSecondaryActions";
import type {
  ChallengeIncomingPayload,
  ChallengeOutgoingPayload,
  LobbyPlayerSnapshot
} from "../network/protocol";
import {
  sceneWarmupHintForMatchPage,
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
  displayName: string;
  onlinePlayers: LobbyPlayerSnapshot[];
  incomingChallenge: ChallengeIncomingPayload | null;
  outgoingChallenge: ChallengeOutgoingPayload | null;
  challengeNotice: string | null;
  onDisplayNameChange: (displayName: string) => void;
  onSendChallenge: (targetSocketId: string) => void;
  onRespondChallenge: (accept: boolean) => void;
  onCancelOutgoingChallenge: () => void;
}

function formatWaitTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function presenceStatusText(status: LobbyPlayerSnapshot["status"]): string {
  if (status === "idle") {
    return "空闲";
  }
  if (status === "queuing") {
    return "匹配中";
  }
  if (status === "in-game") {
    return "对局中";
  }
  return "处理中";
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
  onRetryWarmup,
  displayName,
  onlinePlayers,
  incomingChallenge,
  outgoingChallenge,
  challengeNotice,
  onDisplayNameChange,
  onSendChallenge,
  onRespondChallenge,
  onCancelOutgoingChallenge
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
  const warmupHint = sceneWarmupHintForMatchPage(sceneWarmupStatus, {
    intentOnlyMode: warmupIntentOnlyMode,
    autoRetrying: isWarmupAutoRetrying,
    boardWarmupStatus: sceneWarmupBoardStatus,
    primaryBlockerSource: blockerDecision.primaryBlockerSource,
    canRetryWarmup: secondaryActions.retryWarmupAction.visible && secondaryActions.retryWarmupAction.enabled
  });
  const challengablePlayers = onlinePlayers.filter((player) => !player.isSelf);

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
        <div className="match-display-name-row">
          <label className="match-display-name-label" htmlFor="match-display-name">
            你的昵称
          </label>
          <input
            id="match-display-name"
            className="match-display-name-input"
            type="text"
            maxLength={16}
            value={displayName}
            onChange={(event) => onDisplayNameChange(event.target.value)}
          />
        </div>
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
        {challengeNotice ? <p className="match-challenge-notice">{challengeNotice}</p> : null}
        {incomingChallenge ? (
          <div className="match-challenge-card incoming">
            <p className="match-challenge-title">收到挑战</p>
            <p className="match-challenge-detail">{incomingChallenge.fromDisplayName} 邀请你立即开战</p>
            <div className="match-challenge-actions">
              <button className="primary-button" type="button" onClick={() => onRespondChallenge(true)}>
                应战
              </button>
              <button className="secondary-button" type="button" onClick={() => onRespondChallenge(false)}>
                拒绝
              </button>
            </div>
          </div>
        ) : null}
        {outgoingChallenge ? (
          <div className="match-challenge-card outgoing">
            <p className="match-challenge-title">挑战发送中</p>
            <p className="match-challenge-detail">
              已向 {outgoingChallenge.targetDisplayName} 发起挑战，等待对方应答
            </p>
            <button className="secondary-button" type="button" onClick={onCancelOutgoingChallenge}>
              取消挑战
            </button>
          </div>
        ) : null}
        <div className="match-online-list">
          <div className="match-online-header">
            <span>在线玩家</span>
            <span>{challengablePlayers.length} 人可见</span>
          </div>
          {challengablePlayers.length === 0 ? (
            <p className="match-online-empty">暂无其他在线玩家，先快速匹配也可以。</p>
          ) : (
            challengablePlayers.map((player) => {
              const canChallenge = player.status === "idle" && !isQueuing && outgoingChallenge === null;
              return (
                <div key={player.socketId} className="match-online-item">
                  <div>
                    <p className="match-online-name">{player.displayName}</p>
                    <p className={`match-online-status ${player.status}`}>{presenceStatusText(player.status)}</p>
                  </div>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={!canChallenge}
                    onClick={() => onSendChallenge(player.socketId)}
                  >
                    发起挑战
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
