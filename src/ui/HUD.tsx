import type { PlayerMark, Winner } from "../network/protocol";
import type { LayoutMode } from "../game/interaction/deviceMode";
import {
  qualityLevelLabel,
  qualityModeLabel,
  type QualityLevel,
  type QualityMode
} from "../game/interaction/qualityProfile";
import type { OnboardingGuideState } from "../game/interaction/onboardingGuide";
import type { SmartActionState } from "../game/interaction/smartAction";
import type { TimeoutAssistUrgency } from "../game/interaction/timeoutAssist";
import type { TimeoutAssistNetworkTier } from "../game/interaction/networkLatency";
import type { AutoRematchPhase } from "../game/interaction/autoRematch";
import type { AutoContinueAfterFallbackPhase } from "../game/interaction/autoContinueAfterFallback";
import type { RematchWaitPhase } from "../game/interaction/rematchWait";
import type { TurnNudgePermissionPhase } from "../game/interaction/turnNudgePermission";
import { SmartActionBar } from "./SmartActionBar";

interface HUDProps {
  layoutMode: LayoutMode;
  roomId: string;
  boardSize: number;
  myMark: PlayerMark;
  turn: PlayerMark;
  winner: Winner;
  assistEnabled: boolean;
  focusLayer: number;
  focusMode: "auto" | "manual";
  smartAction: SmartActionState;
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
  onAutoFocus: () => void;
  onToggleAssist: () => void;
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

export function HUD({
  layoutMode,
  roomId,
  boardSize,
  myMark,
  turn,
  winner,
  assistEnabled,
  focusLayer,
  focusMode,
  smartAction,
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
  onAutoFocus,
  onToggleAssist,
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
      ? "更多操作"
      : "展开高级操作";
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
  const showTurnCountdown = !winner && turnRemainingSeconds !== null;
  const showTimeoutAssistHint = !winner && turn === myMark;
  const showAutoRematchHint = Boolean(winner) && opponentConnected;
  const showAutoContinueHint =
    Boolean(winner) && rematchWaitPhase === "fallback-ready" && autoRematchEnabled;
  const showRematchWaitHint =
    Boolean(winner) &&
    myRematchReady &&
    opponentConnected &&
    !opponentRematchReady &&
    rematchWaitPhase !== "idle" &&
    !showAutoContinueHint;
  const timeoutAssistNetworkHint =
    timeoutAssistNetworkTier === "unstable"
      ? "弱网提前"
      : timeoutAssistNetworkTier === "elevated"
        ? "网络波动提前"
        : null;
  const timeoutAssistText = !timeoutAssistEnabled
    ? "超时护航已关闭"
    : timeoutAssistUrgency === "armed"
      ? timeoutAssistNetworkHint
        ? `超时护航：剩余 ${turnRemainingSeconds ?? 0}s，${timeoutAssistNetworkHint}自动执行建议落子`
        : `超时护航：剩余 ${turnRemainingSeconds ?? 0}s，将自动按建议落子`
      : timeoutAssistUrgency === "triggered"
        ? timeoutAssistNetworkHint
          ? `超时护航：本回合已自动执行保底落子（${timeoutAssistNetworkHint}）`
          : "超时护航：本回合已自动执行保底落子"
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
  const turnNudgePermissionPromptText = "启用系统通知后，切后台也能及时收到“轮到你了”提醒";
  const turnNudgePermissionDeniedText = "浏览器已禁用系统通知，可在浏览器设置中手动开启";

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
        {onboardingGuide ? (
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
        {showRematchReadyCheck ? (
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
        {showReconnectDeadline ? (
          <div className={`hud-reconnect-banner ${reconnectUrgent ? "urgent" : ""}`}>
            对手掉线，{reconnectDeadlineSeconds}s 内重连，否则自动判负
          </div>
        ) : null}
        {showTurnNudgePermissionPrompt ? (
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
        {showTurnNudgePermissionDenied ? (
          <div className="hud-turn-nudge-permission denied">
            <div className="hud-turn-nudge-permission-text">{turnNudgePermissionDeniedText}</div>
            <div className="hud-actions">
              <button className="hud-mini-button" type="button" onClick={onDismissTurnNudgePermissionHint}>
                稍后提醒
              </button>
            </div>
          </div>
        ) : null}
        <SmartActionBar action={smartAction} onAction={onPrimaryAction} layoutMode={layoutMode} />
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
              <span>渲染模式</span>
              <span>{qualityModeLabel(qualityMode)}</span>
            </div>
            <div className="hud-row">
              <span>实时帧率</span>
              <span>{averageFps === null ? "采样中..." : `${Math.round(averageFps)} FPS`}</span>
            </div>
            <div className="hud-actions">
              <button
                className={`hud-mini-button ${qualityMode === "auto" ? "active" : ""}`}
                type="button"
                onClick={() => onQualityModeChange("auto")}
              >
                自动
              </button>
              <button
                className={`hud-mini-button ${qualityMode === "quality" ? "active" : ""}`}
                type="button"
                onClick={() => onQualityModeChange("quality")}
              >
                画质优先
              </button>
              <button
                className={`hud-mini-button ${qualityMode === "smooth" ? "active" : ""}`}
                type="button"
                onClick={() => onQualityModeChange("smooth")}
              >
                流畅优先
              </button>
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
            <div className="hud-actions">
              <button
                className={`hud-mini-button ${autoRematchEnabled ? "active" : ""}`}
                type="button"
                onClick={onToggleAutoRematch}
              >
                连战模式：{autoRematchEnabled ? "开" : "关"}
              </button>
              <button
                className={`hud-mini-button ${timeoutAssistEnabled ? "active" : ""}`}
                type="button"
                onClick={onToggleTimeoutAssist}
              >
                超时护航：{timeoutAssistEnabled ? "开" : "关"}
              </button>
              <button
                className={`hud-mini-button ${turnNudgeEnabled ? "active" : ""}`}
                type="button"
                onClick={onToggleTurnNudge}
              >
                回合唤醒：{turnNudgeEnabled ? "开" : "关"}
              </button>
              <button className="hud-button ghost" type="button" onClick={onToggleAssist}>
                战术辅助：{assistEnabled ? "开" : "关"}
              </button>
              <button className="hud-button" type="button" onClick={onRematch} disabled={!canRematch}>
                再来一局
              </button>
            </div>
            <div className="hud-actions">
              <button className="hud-button ghost" type="button" onClick={onLeave}>
                离开
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
