import { useEffect, useRef, useState } from "react";
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
  onStartBotMatch: () => void;
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
  onSpectate: (targetSocketId: string) => void;
  onRespondChallenge: (accept: boolean) => void;
  onCancelOutgoingChallenge: () => void;
}

interface FeedbackTicket {
  id: string;
  content: string;
  createdAt: number;
  status: "open";
}

const FEEDBACK_TICKET_STORAGE_KEY = "nebula-cube-feedback-tickets-v1";
const FEEDBACK_TICKET_MAX_COUNT = 12;

function readFeedbackTicketsFromStorage(): FeedbackTicket[] {
  if (typeof localStorage === "undefined") {
    return [];
  }
  const raw = localStorage.getItem(FEEDBACK_TICKET_STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as FeedbackTicket[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((ticket) => {
        return (
          typeof ticket?.id === "string" &&
          typeof ticket?.content === "string" &&
          typeof ticket?.createdAt === "number" &&
          ticket.status === "open"
        );
      })
      .slice(0, FEEDBACK_TICKET_MAX_COUNT);
  } catch {
    return [];
  }
}

function persistFeedbackTicketsToStorage(tickets: FeedbackTicket[]): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(FEEDBACK_TICKET_STORAGE_KEY, JSON.stringify(tickets));
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

function formatFeedbackTicketTime(createdAt: number): string {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(createdAt);
  } catch {
    return String(createdAt);
  }
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
  onStartBotMatch,
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
  onSpectate,
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
  const [displayNameDraft, setDisplayNameDraft] = useState(displayName);
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [displayNameSavedToastVisible, setDisplayNameSavedToastVisible] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [ticketDraft, setTicketDraft] = useState("");
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [ticketSubmitNotice, setTicketSubmitNotice] = useState<string | null>(null);
  const [feedbackTickets, setFeedbackTickets] = useState<FeedbackTicket[]>(() =>
    readFeedbackTicketsFromStorage()
  );
  const committedDraftRef = useRef(displayName);
  const displayNameSavedToastTimerRef = useRef<number | null>(null);
  const ticketNoticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setDisplayNameDraft(displayName);
    committedDraftRef.current = displayName;
    setDisplayNameError(null);
  }, [displayName]);

  const clearDisplayNameSavedToastTimer = () => {
    if (typeof window === "undefined" || displayNameSavedToastTimerRef.current === null) {
      return;
    }
    window.clearTimeout(displayNameSavedToastTimerRef.current);
    displayNameSavedToastTimerRef.current = null;
  };

  const showDisplayNameSavedToast = () => {
    setDisplayNameSavedToastVisible(true);
    if (typeof window === "undefined") {
      return;
    }
    clearDisplayNameSavedToastTimer();
    displayNameSavedToastTimerRef.current = window.setTimeout(() => {
      setDisplayNameSavedToastVisible(false);
      displayNameSavedToastTimerRef.current = null;
    }, 1600);
  };

  useEffect(() => () => clearDisplayNameSavedToastTimer(), []);

  const clearTicketNoticeTimer = () => {
    if (typeof window === "undefined" || ticketNoticeTimerRef.current === null) {
      return;
    }
    window.clearTimeout(ticketNoticeTimerRef.current);
    ticketNoticeTimerRef.current = null;
  };

  useEffect(() => () => clearTicketNoticeTimer(), []);

  useEffect(() => {
    persistFeedbackTicketsToStorage(feedbackTickets);
  }, [feedbackTickets]);

  const handleDisplayNameCommit = () => {
    const committed = displayNameDraft.trim();
    if (!committed) {
      setDisplayNameError("昵称不能为空");
      setDisplayNameSavedToastVisible(false);
      return;
    }
    if (committed !== committedDraftRef.current) {
      onDisplayNameChange(committed);
      showDisplayNameSavedToast();
    }
    committedDraftRef.current = committed;
    setDisplayNameDraft(committed);
    setDisplayNameError(null);
  };

  const handleTicketSubmit = () => {
    const content = ticketDraft.trim();
    if (!content) {
      setTicketError("建议内容不能为空");
      return;
    }
    const nextTicket: FeedbackTicket = {
      id:
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID().slice(0, 8)
          : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      content: content.slice(0, 300),
      createdAt: Date.now(),
      status: "open"
    };
    setFeedbackTickets((current) => [nextTicket, ...current].slice(0, FEEDBACK_TICKET_MAX_COUNT));
    setTicketDraft("");
    setTicketError(null);
    setTicketSubmitNotice("工单已提交，感谢反馈");
    if (typeof window === "undefined") {
      return;
    }
    clearTicketNoticeTimer();
    ticketNoticeTimerRef.current = window.setTimeout(() => {
      setTicketSubmitNotice(null);
      ticketNoticeTimerRef.current = null;
    }, 2000);
  };

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
          <div className="match-display-name-control">
            <input
              id="match-display-name"
              className="match-display-name-input"
              type="text"
              maxLength={16}
              value={displayNameDraft}
              onChange={(event) => {
                setDisplayNameDraft(event.target.value);
                if (displayNameError) {
                  setDisplayNameError(null);
                }
              }}
              onBlur={handleDisplayNameCommit}
            />
            <button
              className="match-display-name-save"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleDisplayNameCommit}
            >
              保存
            </button>
          </div>
          {displayNameError ? <p className="match-display-name-error">{displayNameError}</p> : null}
          {displayNameSavedToastVisible ? (
            <p className="match-display-name-toast" role="status" aria-live="polite">
              保存成功 · 昵称已同步
            </p>
          ) : null}
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
        <div className="match-mode-actions">
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
          <button
            className="bot-button"
            type="button"
            onClick={onStartBotMatch}
            onPointerEnter={onPrepareArena}
            onFocus={onPrepareArena}
            onTouchStart={onPrepareArena}
            disabled={startDisabled}
          >
            人机对战 · AI Hard
          </button>
        </div>
        <button className="secondary-button match-tutorial-trigger" type="button" onClick={() => setTutorialOpen(true)}>
          新手教程
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
              const canSpectate = player.status === "in-game" && !isQueuing;
              const actionLabel =
                player.status === "idle"
                  ? "发起挑战"
                  : player.status === "in-game"
                    ? "观战"
                    : player.status === "queuing"
                      ? "匹配中"
                      : "处理中";
              const actionDisabled = player.status === "idle" ? !canChallenge : !canSpectate;
              const actionClassName =
                player.status === "in-game"
                  ? "secondary-button match-online-action spectate"
                  : "secondary-button match-online-action";
              const onActionClick = () => {
                if (player.status === "in-game") {
                  onSpectate(player.socketId);
                  return;
                }
                onSendChallenge(player.socketId);
              };
              return (
                <div key={player.socketId} className="match-online-item">
                  <div>
                    <p className="match-online-name">{player.displayName}</p>
                    <p className={`match-online-status ${player.status}`}>{presenceStatusText(player.status)}</p>
                  </div>
                  <button
                    className={actionClassName}
                    type="button"
                    disabled={actionDisabled}
                    onClick={onActionClick}
                  >
                    {actionLabel}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
      {tutorialOpen ? (
        <div
          className="match-tutorial-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="新手教程"
          onClick={() => setTutorialOpen(false)}
        >
          <section className="match-tutorial-panel" onClick={(event) => event.stopPropagation()}>
            <div className="match-tutorial-header">
              <div>
                <p className="match-tutorial-kicker">快速上手</p>
                <h3>新手教程</h3>
              </div>
              <button
                className="match-tutorial-close"
                type="button"
                aria-label="关闭新手教程"
                onClick={() => setTutorialOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="match-tutorial-list">
              <p>
                <strong>快捷键切换聚焦层</strong>
                <span>默认按 D 上一层、A 下一层，可在设置里改为你顺手的键位。</span>
              </p>
              <p>
                <strong>滚轮缩放</strong>
                <span>鼠标滚轮可快速拉近或拉远棋盘，观察全局或细节都更顺手。</span>
              </p>
              <p>
                <strong>可调节清晰度</strong>
                <span>在设置中调节“未聚焦层清晰度”，减少视觉干扰并突出当前战场。</span>
              </p>
            </div>
          </section>
        </div>
      ) : null}
      <button
        className="match-feedback-trigger"
        type="button"
        onClick={() => {
          setFeedbackOpen(true);
          setTicketError(null);
        }}
      >
        反馈
      </button>
      <aside className={`match-feedback-panel ${feedbackOpen ? "is-open" : ""}`} aria-hidden={!feedbackOpen}>
        <div className="match-feedback-panel-header">
          <div>
            <p className="match-feedback-kicker">帮助我们更好</p>
            <h3>提交工单</h3>
          </div>
          <button
            className="match-feedback-close"
            type="button"
            onClick={() => {
              setFeedbackOpen(false);
              setTicketError(null);
            }}
            aria-label="关闭工单面板"
          >
            ×
          </button>
        </div>
        <label className="match-feedback-label" htmlFor="match-feedback-input">
          你的建议
        </label>
        <textarea
          id="match-feedback-input"
          className="match-feedback-input"
          maxLength={300}
          placeholder="例如：希望支持观战模式、快捷复盘、战绩筛选..."
          value={ticketDraft}
          onChange={(event) => {
            setTicketDraft(event.target.value);
            if (ticketError) {
              setTicketError(null);
            }
          }}
        />
        <div className="match-feedback-actions">
          <button className="primary-button match-feedback-submit" type="button" onClick={handleTicketSubmit}>
            提交工单
          </button>
        </div>
        {ticketError ? <p className="match-feedback-error">{ticketError}</p> : null}
        {ticketSubmitNotice ? <p className="match-feedback-notice">{ticketSubmitNotice}</p> : null}
        <div className="match-feedback-list">
          <div className="match-feedback-list-header">
            <span>已有工单</span>
            <span>{feedbackTickets.length} 条</span>
          </div>
          {feedbackTickets.length === 0 ? (
            <p className="match-feedback-empty">还没有工单，欢迎提交第一条建议。</p>
          ) : (
            feedbackTickets.map((ticket) => (
              <article key={ticket.id} className="match-feedback-item">
                <div className="match-feedback-item-meta">
                  <span>#{ticket.id}</span>
                  <span>{formatFeedbackTicketTime(ticket.createdAt)}</span>
                </div>
                <p>{ticket.content}</p>
              </article>
            ))
          )}
        </div>
      </aside>
    </main>
  );
}
