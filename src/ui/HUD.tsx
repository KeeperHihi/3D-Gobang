import type { Coordinate3D, PlayerMark, Winner } from "../network/protocol";
import type { LayoutMode } from "../game/interaction/deviceMode";
import {
  qualityLevelLabel,
  qualityModeLabel,
  type QualityLevel,
  type QualityMode
} from "../game/interaction/qualityProfile";
import type { OnboardingGuideState } from "../game/interaction/onboardingGuide";
import type { PrimaryIntentState } from "../game/interaction/primaryIntent";
import type {
  TimeoutAssistNextAction,
  TimeoutAssistUrgency
} from "../game/interaction/timeoutAssist";
import type { TimeoutAssistNetworkTier } from "../game/interaction/networkLatency";
import type { AutoRematchPhase } from "../game/interaction/autoRematch";
import type { AutoContinueAfterFallbackPhase } from "../game/interaction/autoContinueAfterFallback";
import type { RematchWaitPhase } from "../game/interaction/rematchWait";
import type { TurnNudgePermissionPhase } from "../game/interaction/turnNudgePermission";
import type { HudSpotlightCardId, HudSpotlightDecision } from "../game/interaction/hudSpotlight";
import type { LayerQuickNavDecision } from "../game/interaction/layerQuickNav";
import { SmartActionBar } from "./SmartActionBar";

interface HUDProps {
  layoutMode: LayoutMode;
  roomId: string;
  boardSize: number;
  myMark: PlayerMark;
  turn: PlayerMark;
  winner: Winner;
  hudSpotlight: HudSpotlightDecision;
  winLineSummary: string | null;
  winLineCinematicActive: boolean;
  assistEnabled: boolean;
  nonFocusLayerOpacity: number;
  focusLayer: number;
  focusMode: "auto" | "manual";
  layerQuickNav: LayerQuickNavDecision;
  tapLockCoordinate: Coordinate3D | null;
  tapLockVisible: boolean;
  tapLockRemainingMs: number | null;
  primaryAction: PrimaryIntentState;
  onboardingGuide: OnboardingGuideState | null;
  advancedOpen: boolean;
  qualityMode: QualityMode;
  qualityLevel: QualityLevel;
  averageFps: number | null;
  myConnected: boolean;
  opponentConnected: boolean;
  turnRemainingMs: number | null;
  turnUrgent: boolean;
  timeoutAssistEnabled: boolean;
  timeoutAssistUrgency: TimeoutAssistUrgency;
  timeoutAssistNextAction: TimeoutAssistNextAction;
  timeoutAssistThresholdMs: number;
  timeoutAssistNetworkTier: TimeoutAssistNetworkTier;
  turnNudgeEnabled: boolean;
  turnNudgePermissionPhase: TurnNudgePermissionPhase;
  turnNudgePermissionCanRequest: boolean;
  turnNudgePermissionRequestPending: boolean;
  autoRematchEnabled: boolean;
  autoRematchPhase: AutoRematchPhase;
  autoRematchCountdownRemainingMs: number | null;
  autoRematchCanCancel: boolean;
  autoContinuePhase: AutoContinueAfterFallbackPhase;
  autoContinueCountdownRemainingMs: number | null;
  autoContinueCanCancel: boolean;
  rematchWaitPhase: RematchWaitPhase;
  rematchWaitRemainingMs: number | null;
  myRematchReady: boolean;
  opponentRematchReady: boolean;
  opponentReconnectRemainingMs: number | null;
  connectionStatus: "connecting" | "online" | "reconnecting" | "offline";
  onPrimaryAction: () => void;
  onToggleTimeoutAssist: () => void;
  onToggleTurnNudge: () => void;
  onRequestTurnNudgePermission: () => void;
  onDismissTurnNudgePermissionHint: () => void;
  onToggleAutoRematch: () => void;
  onCancelAutoRematch: () => void;
  onCancelAutoContinue: () => void;
  onOnboardingPrimaryAction: () => void;
  onOnboardingSkip: () => void;
  onToggleAdvanced: () => void;
  onLayerStep: (step: -1 | 1) => void;
  onLayerSmartJump: () => void;
  onJumpToTapLockLayer: () => void;
  onCancelTapLock: () => void;
  onAutoFocus: () => void;
  onToggleAssist: () => void;
  onNonFocusLayerOpacityChange: (opacity: number) => void;
  onQualityModeChange: (mode: QualityMode) => void;
  onRematch: () => void;
  onLeave: () => void;
}

function connectionLabel(status: HUDProps["connectionStatus"]): string {
  if (status === "online") {
    return "在线";
  }
  if (status === "reconnecting") {
    return "重连中";
  }
  if (status === "connecting") {
    return "连接中";
  }
  return "离线";
}

function winnerText(winner: Winner, myMark: PlayerMark): string {
  if (!winner) {
    return "继续战斗";
  }
  if (winner === "draw") {
    return "平局";
  }
  if (winner === myMark) {
    return "你赢了";
  }
  return "对手胜利";
}

function spotlightTitle(cardId: HudSpotlightCardId): string {
  if (cardId === "connection") {
    return "连接状态";
  }
  if (cardId === "reconnect") {
    return "掉线结算";
  }
  if (cardId === "turn-clock") {
    return "回合时钟";
  }
  if (cardId === "timeout-assist") {
    return "超时护航";
  }
  if (cardId === "win-line") {
    return "胜线导演";
  }
  if (cardId === "auto-rematch") {
    return "连战模式";
  }
  if (cardId === "auto-continue") {
    return "自动继续";
  }
  if (cardId === "rematch-wait") {
    return "等待熔断";
  }
  if (cardId === "ready-check") {
    return "再战确认";
  }
  if (cardId === "turn-nudge-prompt" || cardId === "turn-nudge-denied") {
    return "回合唤醒";
  }
  return "新手引导";
}

export function HUD({
  layoutMode,
  roomId,
  boardSize,
  myMark,
  turn,
  winner,
  hudSpotlight,
  winLineSummary,
  winLineCinematicActive,
  assistEnabled,
  nonFocusLayerOpacity,
  focusLayer,
  focusMode,
  layerQuickNav,
  tapLockCoordinate,
  tapLockVisible,
  tapLockRemainingMs,
  primaryAction,
  onboardingGuide,
  advancedOpen,
  qualityMode,
  qualityLevel,
  averageFps,
  myConnected,
  opponentConnected,
  turnRemainingMs,
  turnUrgent,
  timeoutAssistEnabled,
  timeoutAssistUrgency,
  timeoutAssistNextAction,
  timeoutAssistThresholdMs,
  timeoutAssistNetworkTier,
  turnNudgeEnabled,
  turnNudgePermissionPhase,
  turnNudgePermissionCanRequest,
  turnNudgePermissionRequestPending,
  autoRematchEnabled,
  autoRematchPhase,
  autoRematchCountdownRemainingMs,
  autoRematchCanCancel,
  autoContinuePhase,
  autoContinueCountdownRemainingMs,
  autoContinueCanCancel,
  rematchWaitPhase,
  rematchWaitRemainingMs,
  myRematchReady,
  opponentRematchReady,
  opponentReconnectRemainingMs,
  connectionStatus,
  onPrimaryAction,
  onToggleTimeoutAssist,
  onToggleTurnNudge,
  onRequestTurnNudgePermission,
  onDismissTurnNudgePermissionHint,
  onToggleAutoRematch,
  onCancelAutoRematch,
  onCancelAutoContinue,
  onOnboardingPrimaryAction,
  onOnboardingSkip,
  onToggleAdvanced,
  onLayerStep,
  onLayerSmartJump,
  onJumpToTapLockLayer,
  onCancelTapLock,
  onAutoFocus,
  onToggleAssist,
  onNonFocusLayerOpacityChange,
  onQualityModeChange,
  onRematch,
  onLeave
}: HUDProps) {
  const isMobileLayout = layoutMode === "mobile";
  const canRematch = Boolean(winner) && opponentConnected && !myRematchReady;
  const turnText = winner
    ? winnerText(winner, myMark)
    : turn === myMark
      ? "轮到你落子"
      : "等待对手落子";
  const reconnectDeadlineSeconds =
    opponentReconnectRemainingMs === null ? null : Math.max(0, Math.ceil(opponentReconnectRemainingMs / 1000));
  const showReconnectDeadline = !winner && reconnectDeadlineSeconds !== null && !opponentConnected;
  const showRematchReadyCheck = Boolean(winner) && opponentConnected;
  const reconnectUrgent = reconnectDeadlineSeconds !== null && reconnectDeadlineSeconds <= 10;
  const advancedToggleLabel = advancedOpen
    ? "收起操作面板"
    : isMobileLayout
      ? "更多状态"
      : "展开更多状态";
  const turnRemainingSeconds =
    turnRemainingMs === null ? null : Math.max(0, Math.ceil(turnRemainingMs / 1000));
  const timeoutAssistThresholdSeconds = Math.max(1, Math.ceil(timeoutAssistThresholdMs / 1000));
  const autoRematchCountdownSeconds =
    autoRematchCountdownRemainingMs === null
      ? null
      : Math.max(0, Math.ceil(autoRematchCountdownRemainingMs / 1000));
  const autoContinueCountdownSeconds =
    autoContinueCountdownRemainingMs === null
      ? null
      : Math.max(0, Math.ceil(autoContinueCountdownRemainingMs / 1000));
  const rematchWaitRemainingSeconds =
    rematchWaitRemainingMs === null ? null : Math.max(0, Math.ceil(rematchWaitRemainingMs / 1000));
  const tapLockSecondsLeft =
    tapLockRemainingMs === null ? null : Math.max(0, Math.ceil(tapLockRemainingMs / 1000));
  const nonFocusOpacityPercent = Math.round(Math.max(2, Math.min(100, nonFocusLayerOpacity * 100)));
  const primaryCardId = hudSpotlight.primaryCard?.id ?? null;
  const showTurnCountdown = primaryCardId === "turn-clock" && !winner && turnRemainingSeconds !== null;
  const showTimeoutAssistHint = primaryCardId === "timeout-assist" && !winner && turn === myMark;
  const showWinLineSummary =
    primaryCardId === "win-line" && Boolean(winner && winner !== "draw" && winLineSummary);
  const showAutoRematchHint = primaryCardId === "auto-rematch" && Boolean(winner) && opponentConnected;
  const showAutoContinueHint =
    primaryCardId === "auto-continue" &&
    Boolean(winner) &&
    rematchWaitPhase === "fallback-ready" &&
    autoRematchEnabled;
  const showRematchWaitHint =
    primaryCardId === "rematch-wait" &&
    Boolean(winner) &&
    myRematchReady &&
    opponentConnected &&
    !opponentRematchReady &&
    rematchWaitPhase !== "idle";
  const showConnectionSpotlight = primaryCardId === "connection";
  const showReconnectSpotlight = primaryCardId === "reconnect" && showReconnectDeadline;
  const showReadyCheckSpotlight = primaryCardId === "ready-check" && showRematchReadyCheck;
  const showOnboardingSpotlight = primaryCardId === "onboarding" && Boolean(onboardingGuide);
  const timeoutAssistNetworkHint =
    timeoutAssistNetworkTier === "unstable"
      ? "弱网提前"
      : timeoutAssistNetworkTier === "elevated"
        ? "网络波动提前"
        : null;
  const timeoutAssistText = !timeoutAssistEnabled
    ? "超时护航已关闭"
    : timeoutAssistNextAction === "jumpToLock"
      ? `超时护航：剩余 ${turnRemainingSeconds ?? 0}s，将先回到锁定层再确认`
    : timeoutAssistUrgency === "armed"
      ? timeoutAssistNetworkHint
        ? `超时护航：剩余 ${turnRemainingSeconds ?? 0}s，${timeoutAssistNetworkHint}自动执行当前主动作`
        : `超时护航：剩余 ${turnRemainingSeconds ?? 0}s，将自动执行当前主动作`
      : timeoutAssistUrgency === "triggered"
        ? timeoutAssistNetworkHint
          ? `超时护航：本回合已自动执行主动作（${timeoutAssistNetworkHint}）`
          : "超时护航：本回合已自动执行主动作"
        : `超时护航已开启（阈值 ${timeoutAssistThresholdSeconds}s）`;
  const autoRematchText = !autoRematchEnabled
    ? "连战模式已关闭"
    : autoRematchPhase === "countdown"
      ? `连战模式：${autoRematchCountdownSeconds ?? 0}s 后自动准备`
      : autoRematchPhase === "armed"
        ? myRematchReady
          ? "连战模式：已自动准备，等待对手"
          : "连战模式：准备提交中"
        : autoRematchPhase === "cancelled"
          ? "连战模式：本局已取消自动准备"
          : "连战模式已开启";
  const rematchWaitText =
    rematchWaitPhase === "fallback-ready"
      ? "等待较久，你可以一键继续匹配"
      : `等待对手确认，${rematchWaitRemainingSeconds ?? 0}s 后可继续匹配`;
  const autoContinueText =
    autoContinuePhase === "countdown"
      ? `${autoContinueCountdownSeconds ?? 0}s 后自动继续匹配`
      : autoContinuePhase === "cancelled"
        ? "本局已取消自动继续，可手动继续匹配"
        : autoContinuePhase === "armed"
          ? "正在自动继续匹配..."
          : "已开启自动继续匹配";
  const showTurnNudgePermissionPrompt = turnNudgePermissionPhase === "prompt";
  const showTurnNudgePermissionDenied = turnNudgePermissionPhase === "denied";
  const showTurnNudgePermissionPromptSpotlight =
    primaryCardId === "turn-nudge-prompt" && showTurnNudgePermissionPrompt;
  const showTurnNudgePermissionDeniedSpotlight =
    primaryCardId === "turn-nudge-denied" && showTurnNudgePermissionDenied;
  const turnNudgePermissionPromptText = "启用系统通知后，切后台也能及时收到“轮到你了”提醒";
  const turnNudgePermissionDeniedText = "浏览器已禁用系统通知，可在浏览器设置中手动开启";
  const spotlightToneClass =
    hudSpotlight.primaryCard?.tone === "critical"
      ? "critical"
      : hudSpotlight.primaryCard?.tone === "action"
        ? "action"
        : "info";
  const secondaryItems = hudSpotlight.secondaryItems
    .map((item) => {
      if (item.id === "connection") {
        return `网络${connectionLabel(connectionStatus)}，暂不可执行主操作`;
      }
      if (item.id === "reconnect") {
        return `对手掉线，${reconnectDeadlineSeconds ?? 0}s 内未重连将自动判负`;
      }
      if (item.id === "turn-clock") {
        return `${turn === myMark ? "你的回合" : "对手回合"} · 剩余 ${turnRemainingSeconds ?? 0}s`;
      }
      if (item.id === "timeout-assist") {
        return timeoutAssistText;
      }
      if (item.id === "win-line") {
        return winLineSummary ? `胜线解析：${winLineSummary}` : null;
      }
      if (item.id === "auto-rematch") {
        return autoRematchText;
      }
      if (item.id === "auto-continue") {
        return autoContinueText;
      }
      if (item.id === "rematch-wait") {
        return rematchWaitText;
      }
      if (item.id === "ready-check") {
        return `再战状态：你${myRematchReady ? "已准备" : "未准备"} · 对手${
          opponentRematchReady ? "已准备" : "未准备"
        }`;
      }
      if (item.id === "turn-nudge-prompt") {
        return turnNudgePermissionPromptText;
      }
      if (item.id === "turn-nudge-denied") {
        return turnNudgePermissionDeniedText;
      }
      if (item.id === "onboarding") {
        return onboardingGuide ? `${onboardingGuide.title}：${onboardingGuide.detail}` : null;
      }
      return null;
    })
    .filter((item): item is string => Boolean(item));
  const smartJumpDisabled = layerQuickNav.smartJumpLayer === focusLayer;
  const smartJumpLabel =
    layerQuickNav.smartJumpSource === "recommended"
      ? "跳到推荐层"
      : layerQuickNav.smartJumpSource === "recent"
        ? "跳到最近层"
        : layerQuickNav.smartJumpSource === "auto"
          ? "智能跳层"
          : "已在目标层";
  const tapLockCoordinateLabel = tapLockCoordinate
    ? `L${tapLockCoordinate.z + 1} · (${tapLockCoordinate.x + 1}, ${tapLockCoordinate.y + 1})`
    : null;

  return (
    <div className={`hud-root ${isMobileLayout ? "mobile" : "desktop"}`}>
      <div className="hud-card">
        <div className="hud-title">NEBULA CUBE</div>
        {!isMobileLayout ? (
          <>
            <div className="hud-row">
              <span>房间</span>
              <span>{roomId}</span>
            </div>
            <div className="hud-row">
              <span>你的棋子</span>
              <span>{myMark}</span>
            </div>
            <div className="hud-row">
              <span>网络</span>
              <span>{connectionLabel(connectionStatus)}</span>
            </div>
            <div className="hud-row">
              <span>你</span>
              <span>{myConnected ? "在线" : "掉线"}</span>
            </div>
            <div className="hud-row">
              <span>对手</span>
              <span>{opponentConnected ? "在线" : "掉线"}</span>
            </div>
          </>
        ) : null}
        <div className="hud-turn">{turnText}</div>
        {hudSpotlight.primaryCard ? (
          <div className={`hud-spotlight-shell ${spotlightToneClass}`}>
            <div className="hud-spotlight-title">{spotlightTitle(hudSpotlight.primaryCard.id)}</div>
          </div>
        ) : null}
        {showWinLineSummary ? (
          <div className={`hud-winline-director ${winLineCinematicActive ? "active" : "static"}`}>
            <div className="hud-winline-director-title">
              {winLineCinematicActive ? "胜线导演模式" : "胜线解析"}
            </div>
            <div className="hud-winline-director-text">{winLineSummary}</div>
          </div>
        ) : null}
        {showConnectionSpotlight ? (
          <div className="hud-spotlight-note critical">
            网络{connectionLabel(connectionStatus)}，请稍候恢复后继续操作
          </div>
        ) : null}
        {showTurnCountdown ? (
          <div className={`hud-turn-clock ${turnUrgent ? "urgent" : ""}`}>
            {turn === myMark ? "你的回合" : "对手回合"} · 剩余 {turnRemainingSeconds}s（以服务器结算为准）
          </div>
        ) : null}
        {showTimeoutAssistHint ? (
          <div
            className={`hud-timeout-assist ${
              timeoutAssistEnabled
                ? timeoutAssistUrgency === "armed"
                  ? "urgent"
                  : "enabled"
                : "disabled"
            }`}
          >
            {timeoutAssistText}
          </div>
        ) : null}
        {showAutoRematchHint ? (
          <div
            className={`hud-auto-rematch ${
              !autoRematchEnabled
                ? "disabled"
                : autoRematchPhase === "countdown"
                  ? "countdown"
                  : autoRematchPhase === "cancelled"
                    ? "cancelled"
                    : "enabled"
            }`}
          >
            <span>{autoRematchText}</span>
            {autoRematchCanCancel ? (
              <button className="hud-mini-button" type="button" onClick={onCancelAutoRematch}>
                取消自动准备
              </button>
            ) : null}
          </div>
        ) : null}
        {showOnboardingSpotlight && onboardingGuide ? (
          <div className="hud-coach-card">
            <div className="hud-coach-header">
              <span>新手引导</span>
              <span>
                {onboardingGuide.stepIndex}/{onboardingGuide.totalSteps}
              </span>
            </div>
            <div className="hud-coach-title">{onboardingGuide.title}</div>
            <div className="hud-coach-detail">{onboardingGuide.detail}</div>
            <div className="hud-actions">
              {onboardingGuide.primaryActionLabel ? (
                <button
                  className="hud-mini-button active"
                  type="button"
                  onClick={onOnboardingPrimaryAction}
                >
                  {onboardingGuide.primaryActionLabel}
                </button>
              ) : null}
              <button className="hud-mini-button" type="button" onClick={onOnboardingSkip}>
                跳过引导
              </button>
            </div>
          </div>
        ) : null}
        {showReadyCheckSpotlight ? (
          <div className="hud-ready-check">
            <div className={`hud-ready-row ${myRematchReady ? "ready" : "waiting"}`}>
              <span>你</span>
              <span>{myRematchReady ? "已准备" : "未准备"}</span>
            </div>
            <div className={`hud-ready-row ${opponentRematchReady ? "ready" : "waiting"}`}>
              <span>对手</span>
              <span>{opponentRematchReady ? "已准备" : "未准备"}</span>
            </div>
          </div>
        ) : null}
        {showRematchWaitHint ? (
          <div className={`hud-rematch-wait ${rematchWaitPhase === "fallback-ready" ? "fallback-ready" : ""}`}>
            {rematchWaitText}
          </div>
        ) : null}
        {showAutoContinueHint ? (
          <div
            className={`hud-auto-continue ${
              autoContinuePhase === "countdown"
                ? "countdown"
                : autoContinuePhase === "cancelled"
                  ? "cancelled"
                  : "enabled"
            }`}
          >
            <span>{autoContinueText}</span>
            {autoContinueCanCancel ? (
              <button className="hud-mini-button" type="button" onClick={onCancelAutoContinue}>
                取消自动继续
              </button>
            ) : null}
          </div>
        ) : null}
        {showReconnectSpotlight ? (
          <div className={`hud-reconnect-banner ${reconnectUrgent ? "urgent" : ""}`}>
            对手掉线，{reconnectDeadlineSeconds}s 内重连，否则自动判负
          </div>
        ) : null}
        {showTurnNudgePermissionPromptSpotlight ? (
          <div className="hud-turn-nudge-permission prompt">
            <div className="hud-turn-nudge-permission-text">{turnNudgePermissionPromptText}</div>
            <div className="hud-actions">
              <button
                className="hud-mini-button active"
                type="button"
                onClick={onRequestTurnNudgePermission}
                disabled={!turnNudgePermissionCanRequest || turnNudgePermissionRequestPending}
              >
                {turnNudgePermissionRequestPending ? "请求中..." : "启用系统通知"}
              </button>
              <button
                className="hud-mini-button"
                type="button"
                onClick={onDismissTurnNudgePermissionHint}
              >
                稍后提醒
              </button>
            </div>
          </div>
        ) : null}
        {showTurnNudgePermissionDeniedSpotlight ? (
          <div className="hud-turn-nudge-permission denied">
            <div className="hud-turn-nudge-permission-text">{turnNudgePermissionDeniedText}</div>
            <div className="hud-actions">
              <button className="hud-mini-button" type="button" onClick={onDismissTurnNudgePermissionHint}>
                稍后提醒
              </button>
            </div>
          </div>
        ) : null}
        {secondaryItems.length > 0 ? (
          <div className="hud-secondary-list">
            {secondaryItems.map((item, index) => (
              <div key={`${item}-${index}`} className="hud-secondary-item">
                {item}
              </div>
            ))}
          </div>
        ) : null}
        <div className="hud-layer-rail">
          <div className="hud-layer-rail-header">
            <span>层导航</span>
            <span>
              L{focusLayer + 1}/{boardSize} · {focusMode === "auto" ? "自动" : "手动"}
            </span>
          </div>
          <div className="hud-layer-rail-actions">
            <button
              className="hud-mini-button"
              type="button"
              onClick={() => onLayerStep(-1)}
              disabled={!layerQuickNav.canGoPrev}
            >
              上一层
            </button>
            <button
              className={`hud-mini-button ${!smartJumpDisabled ? "active" : ""}`}
              type="button"
              onClick={onLayerSmartJump}
              disabled={smartJumpDisabled}
            >
              {smartJumpLabel}
            </button>
            <button
              className="hud-mini-button"
              type="button"
              onClick={() => onLayerStep(1)}
              disabled={!layerQuickNav.canGoNext}
            >
              下一层
            </button>
            <button
              className="hud-mini-button"
              type="button"
              onClick={onAutoFocus}
              disabled={focusMode === "auto"}
            >
              自动
            </button>
          </div>
          <div className="hud-layer-rail-tags">
            {layerQuickNav.keyTags.map((tag) => (
              <span key={`${tag.kind}-${tag.layer}`} className={`hud-layer-tag ${tag.kind}`}>
                {tag.kind === "current"
                  ? "当前"
                  : tag.kind === "recommended"
                    ? "推荐"
                    : "最近"}{" "}
                L{tag.layer + 1}
              </span>
            ))}
          </div>
        </div>
        {tapLockCoordinate ? (
          <div className="hud-tap-lock">
            <div className="hud-tap-lock-header">
              <span>目标已锁定</span>
              <span>{tapLockCoordinateLabel}</span>
            </div>
            <div className="hud-tap-lock-text">
              {tapLockVisible
                ? `主按钮或空格确认落子${tapLockSecondsLeft !== null ? ` · ${tapLockSecondsLeft}s` : ""}`
                : `当前不在锁定层，先回到 L${tapLockCoordinate.z + 1} 再确认${
                    tapLockSecondsLeft !== null ? ` · ${tapLockSecondsLeft}s` : ""
                  }`}
            </div>
            <div className="hud-actions">
              {!tapLockVisible ? (
                <button className="hud-mini-button active" type="button" onClick={onJumpToTapLockLayer}>
                  回到锁定层
                </button>
              ) : null}
              <button className="hud-mini-button" type="button" onClick={onCancelTapLock}>
                取消
              </button>
            </div>
          </div>
        ) : null}
        <SmartActionBar action={primaryAction} onAction={onPrimaryAction} layoutMode={layoutMode} />
        <div className="hud-actions">
          <button className="hud-button ghost" type="button" onClick={onToggleAdvanced}>
            {advancedToggleLabel}
          </button>
        </div>
        {advancedOpen ? (
          <div className="hud-advanced-panel">
            {isMobileLayout ? (
              <>
                <div className="hud-row">
                  <span>房间</span>
                  <span>{roomId}</span>
                </div>
                <div className="hud-row">
                  <span>你的棋子</span>
                  <span>{myMark}</span>
                </div>
                <div className="hud-row">
                  <span>网络</span>
                  <span>{connectionLabel(connectionStatus)}</span>
                </div>
                <div className="hud-row">
                  <span>你</span>
                  <span>{myConnected ? "在线" : "掉线"}</span>
                </div>
                <div className="hud-row">
                  <span>对手</span>
                  <span>{opponentConnected ? "在线" : "掉线"}</span>
                </div>
              </>
            ) : null}
            <div className="hud-row">
              <span>聚焦层</span>
              <span>
                L{focusLayer + 1}/{boardSize} · {focusMode === "auto" ? "自动" : "手动"}
              </span>
            </div>
            <div className="hud-row">
              <span>渲染档位</span>
              <span>{qualityLevelLabel(qualityLevel)}</span>
            </div>
            <div className="hud-row">
              <span>实时帧率</span>
              <span>{averageFps === null ? "采样中..." : `${Math.round(averageFps)} FPS`}</span>
            </div>
            <div className="hud-setting-row">
              <label className="hud-setting-label" htmlFor="hud-quality-mode">
                渲染模式
              </label>
              <select
                id="hud-quality-mode"
                className="hud-select"
                value={qualityMode}
                onChange={(event) => onQualityModeChange(event.target.value as QualityMode)}
              >
                <option value="auto">{qualityModeLabel("auto")}</option>
                <option value="quality">{qualityModeLabel("quality")}</option>
                <option value="smooth">{qualityModeLabel("smooth")}</option>
              </select>
            </div>
            <div className="hud-slider-group">
              <div className="hud-slider-head">
                <span>未聚焦层清晰度</span>
                <strong>{nonFocusOpacityPercent}%</strong>
              </div>
              <input
                className="hud-slider"
                type="range"
                min={2}
                max={100}
                step={1}
                value={nonFocusOpacityPercent}
                onChange={(event) => onNonFocusLayerOpacityChange(Number(event.target.value) / 100)}
              />
            </div>
            <div className="hud-setting-list">
              <div className="hud-setting-row">
                <span className="hud-setting-label">战术辅助提示</span>
                <button
                  className={`hud-mini-button ${assistEnabled ? "active" : ""}`}
                  type="button"
                  onClick={onToggleAssist}
                >
                  {assistEnabled ? "已开启" : "已关闭"}
                </button>
              </div>
              <div className="hud-setting-row">
                <span className="hud-setting-label">连战模式</span>
                <button
                  className={`hud-mini-button ${autoRematchEnabled ? "active" : ""}`}
                  type="button"
                  onClick={onToggleAutoRematch}
                >
                  {autoRematchEnabled ? "已开启" : "已关闭"}
                </button>
              </div>
              <div className="hud-setting-row">
                <span className="hud-setting-label">超时护航</span>
                <button
                  className={`hud-mini-button ${timeoutAssistEnabled ? "active" : ""}`}
                  type="button"
                  onClick={onToggleTimeoutAssist}
                >
                  {timeoutAssistEnabled ? "已开启" : "已关闭"}
                </button>
              </div>
              <div className="hud-setting-row">
                <span className="hud-setting-label">回合唤醒</span>
                <button
                  className={`hud-mini-button ${turnNudgeEnabled ? "active" : ""}`}
                  type="button"
                  onClick={onToggleTurnNudge}
                >
                  {turnNudgeEnabled ? "已开启" : "已关闭"}
                </button>
              </div>
              {canRematch ? (
                <div className="hud-setting-row">
                  <span className="hud-setting-label">结算操作</span>
                  <button className="hud-mini-button active" type="button" onClick={onRematch}>
                    再来一局
                  </button>
                </div>
              ) : null}
              <div className="hud-setting-row">
                <span className="hud-setting-label">离开房间</span>
                <button className="hud-mini-button danger" type="button" onClick={onLeave}>
                  离开
                </button>
              </div>
            </div>
            <div className="hud-actions">
              <button
                className="hud-mini-button"
                type="button"
                onClick={() => onLayerStep(-1)}
                disabled={focusLayer <= 0}
              >
                上一层
              </button>
              <button
                className="hud-mini-button"
                type="button"
                onClick={() => onLayerStep(1)}
                disabled={focusLayer >= boardSize - 1}
              >
                下一层
              </button>
              <button
                className="hud-mini-button"
                type="button"
                onClick={onAutoFocus}
                disabled={focusMode === "auto"}
              >
                自动聚焦
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
