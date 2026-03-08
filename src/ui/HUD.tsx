import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { PlayerMark, Winner } from "../network/protocol";
import type { LayoutMode } from "../game/interaction/deviceMode";
import {
  qualityLevelLabel,
  qualityModeLabel,
  type QualityLevel,
  type QualityMode
} from "../game/interaction/qualityProfile";
import type { RenderBootstrapPhase } from "../game/interaction/renderBootstrap";
import type { OnboardingGuideState } from "../game/interaction/onboardingGuide";
import type { PrimaryIntentState } from "../game/interaction/primaryIntent";
import type {
  TimeoutAssistAutoActSource,
  TimeoutAssistUrgency
} from "../game/interaction/timeoutAssist";
import type { TimeoutAssistNetworkTier } from "../game/interaction/networkLatency";
import type { AutoRematchPhase } from "../game/interaction/autoRematch";
import type { AutoContinueAfterFallbackPhase } from "../game/interaction/autoContinueAfterFallback";
import type { RematchWaitPhase } from "../game/interaction/rematchWait";
import type { TurnNudgePermissionPhase } from "../game/interaction/turnNudgePermission";
import type { HudSpotlightCardId, HudSpotlightDecision } from "../game/interaction/hudSpotlight";
import type { LayerQuickNavDecision } from "../game/interaction/layerQuickNav";
import { evaluateConnectionGuidance } from "../game/interaction/connectionGuidance";
import type { LayerHotkeys } from "../game/interaction/hotkey";
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
  primaryAction: PrimaryIntentState;
  onboardingGuide: OnboardingGuideState | null;
  settingsOpen: boolean;
  layerHotkeys: LayerHotkeys;
  qualityMode: QualityMode;
  qualityLevel: QualityLevel;
  calmModeActive: boolean;
  renderBootstrapPhase: RenderBootstrapPhase;
  averageFps: number | null;
  myConnected: boolean;
  opponentConnected: boolean;
  turnRemainingMs: number | null;
  turnUrgent: boolean;
  timeoutAssistEnabled: boolean;
  timeoutAssistUrgency: TimeoutAssistUrgency;
  timeoutAssistAutoActSource: TimeoutAssistAutoActSource;
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
  canObserveBoard: boolean;
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
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onLayerStep: (step: -1 | 1) => void;
  onLayerHotkeyChange: (kind: "up" | "down", key: string) => void;
  onResetLayerHotkeys: () => void;
  onToggleAssist: () => void;
  onNonFocusLayerOpacityChange: (opacity: number) => void;
  onQualityModeChange: (mode: QualityMode) => void;
  canSurrender: boolean;
  onSurrender: () => void;
  onRematch: () => void;
  onLeave: () => void;
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

const SETTINGS_CLOSE_TRANSITION_MS = 240;
const SETTINGS_DRAWER_GAP_PX = 14;
const SETTINGS_DRAWER_VIEWPORT_MARGIN_PX = 10;

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
  primaryAction,
  onboardingGuide,
  settingsOpen,
  layerHotkeys,
  qualityMode,
  qualityLevel,
  calmModeActive,
  renderBootstrapPhase,
  averageFps,
  myConnected,
  opponentConnected,
  turnRemainingMs,
  turnUrgent,
  timeoutAssistEnabled,
  timeoutAssistUrgency,
  timeoutAssistAutoActSource,
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
  canObserveBoard,
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
  onOpenSettings,
  onCloseSettings,
  onLayerStep,
  onLayerHotkeyChange,
  onResetLayerHotkeys,
  onToggleAssist,
  onNonFocusLayerOpacityChange,
  onQualityModeChange,
  canSurrender,
  onSurrender,
  onRematch,
  onLeave
}: HUDProps) {
  const [settingsPanelMounted, setSettingsPanelMounted] = useState(settingsOpen);
  const [settingsPanelClosing, setSettingsPanelClosing] = useState(false);
  const [settingsPanelOffset, setSettingsPanelOffset] = useState({ x: 0, y: 0 });
  const [settingsPanelDragging, setSettingsPanelDragging] = useState(false);
  const hudRootRef = useRef<HTMLDivElement | null>(null);
  const settingsDrawerRef = useRef<HTMLDivElement | null>(null);
  const settingsDragStartRef = useRef<{
    pointerId: number;
    pointerX: number;
    pointerY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const isMobileLayout = layoutMode === "mobile";

  const clampSettingsPanelOffset = useCallback((candidateX: number, candidateY: number) => {
    if (isMobileLayout) {
      return { x: 0, y: 0 };
    }
    if (typeof window === "undefined") {
      return { x: candidateX, y: candidateY };
    }
    const rootRect = hudRootRef.current?.getBoundingClientRect();
    const drawerRect = settingsDrawerRef.current?.getBoundingClientRect();
    if (!rootRect || !drawerRect) {
      return { x: candidateX, y: candidateY };
    }

    const baseLeft = rootRect.left + rootRect.width + SETTINGS_DRAWER_GAP_PX;
    const baseTop = rootRect.top;
    const minX = SETTINGS_DRAWER_VIEWPORT_MARGIN_PX - baseLeft;
    const maxX =
      window.innerWidth - SETTINGS_DRAWER_VIEWPORT_MARGIN_PX - baseLeft - drawerRect.width;
    const minY = SETTINGS_DRAWER_VIEWPORT_MARGIN_PX - baseTop;
    const maxY =
      window.innerHeight - SETTINGS_DRAWER_VIEWPORT_MARGIN_PX - baseTop - drawerRect.height;

    return {
      x: Math.max(minX, Math.min(maxX, candidateX)),
      y: Math.max(minY, Math.min(maxY, candidateY))
    };
  }, [isMobileLayout]);

  useEffect(() => {
    if (settingsOpen) {
      setSettingsPanelMounted(true);
      setSettingsPanelClosing(false);
      return;
    }
    if (!settingsPanelMounted) {
      return;
    }
    setSettingsPanelClosing(true);
    if (typeof window === "undefined") {
      setSettingsPanelMounted(false);
      setSettingsPanelClosing(false);
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setSettingsPanelMounted(false);
      setSettingsPanelClosing(false);
      setSettingsPanelDragging(false);
      settingsDragStartRef.current = null;
    }, SETTINGS_CLOSE_TRANSITION_MS);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [settingsOpen, settingsPanelMounted]);

  useEffect(() => {
    if (!settingsPanelMounted) {
      return;
    }
    const applyClamp = () => {
      setSettingsPanelOffset((current) => {
        const clamped = clampSettingsPanelOffset(current.x, current.y);
        if (clamped.x === current.x && clamped.y === current.y) {
          return current;
        }
        return clamped;
      });
    };
    applyClamp();
    if (typeof window === "undefined") {
      return;
    }
    window.addEventListener("resize", applyClamp);
    return () => {
      window.removeEventListener("resize", applyClamp);
    };
  }, [clampSettingsPanelOffset, settingsPanelMounted]);

  const handleSettingsDragStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (isMobileLayout || event.button !== 0) {
        return;
      }
      if (event.target instanceof Element && event.target.closest("button")) {
        return;
      }
      const pointerTarget = event.currentTarget;
      pointerTarget.setPointerCapture(event.pointerId);
      settingsDragStartRef.current = {
        pointerId: event.pointerId,
        pointerX: event.clientX,
        pointerY: event.clientY,
        offsetX: settingsPanelOffset.x,
        offsetY: settingsPanelOffset.y
      };
      setSettingsPanelDragging(true);
    },
    [isMobileLayout, settingsPanelOffset.x, settingsPanelOffset.y]
  );

  const handleSettingsDragMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const dragStart = settingsDragStartRef.current;
      if (!dragStart || dragStart.pointerId !== event.pointerId) {
        return;
      }
      const deltaX = event.clientX - dragStart.pointerX;
      const deltaY = event.clientY - dragStart.pointerY;
      setSettingsPanelOffset(
        clampSettingsPanelOffset(dragStart.offsetX + deltaX, dragStart.offsetY + deltaY)
      );
    },
    [clampSettingsPanelOffset]
  );

  const stopSettingsDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const dragStart = settingsDragStartRef.current;
    if (!dragStart || dragStart.pointerId !== event.pointerId) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    settingsDragStartRef.current = null;
    setSettingsPanelDragging(false);
  }, []);

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
  const turnRemainingSeconds =
    turnRemainingMs === null ? null : Math.max(0, Math.ceil(turnRemainingMs / 1000));
  const showTurnClock = !winner && turnRemainingSeconds !== null;
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
  const nonFocusOpacityPercent = Math.round(Math.max(2, Math.min(100, nonFocusLayerOpacity * 100)));
  const primaryCardId = hudSpotlight.primaryCard?.id ?? null;
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
    : timeoutAssistUrgency === "armed"
      ? timeoutAssistAutoActSource === "fallbackTarget"
        ? timeoutAssistNetworkHint
          ? `超时护航：剩余 ${turnRemainingSeconds ?? 0}s，${timeoutAssistNetworkHint}即将执行兜底落子`
          : `超时护航：剩余 ${turnRemainingSeconds ?? 0}s，即将执行兜底落子`
        : timeoutAssistNetworkHint
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
  const prevLayerLabel = `上一层 (${layerHotkeys.up.toUpperCase()})`;
  const nextLayerLabel = `下一层 (${layerHotkeys.down.toUpperCase()})`;
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
  const connectionGuidance = evaluateConnectionGuidance({
    connectionStatus,
    canObserveBoard
  });
  const connectionSpotlightToneClass =
    connectionGuidance.spotlightTone === "critical" ? "critical" : "info";
  const spotlightToneClass =
    hudSpotlight.primaryCard?.tone === "critical"
      ? "critical"
      : hudSpotlight.primaryCard?.tone === "action"
        ? "action"
        : "info";
  const secondaryItems = hudSpotlight.secondaryItems
    .map((item) => {
      if (item.id === "connection") {
        return connectionGuidance.secondaryHint;
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
  const showMinimalConnectionSpotlight = showConnectionSpotlight;
  const showMinimalReconnectSpotlight = showReconnectSpotlight;
  const showMinimalOnboarding = showOnboardingSpotlight && onboardingGuide;
  const settingsDrawerOpen = settingsOpen && !settingsPanelClosing;
  const settingsDrawerStateClass = settingsDrawerOpen ? "is-open" : "is-closing";
  const settingsDrawerTransform = `translate3d(${
    settingsPanelOffset.x + (settingsDrawerOpen ? 0 : 14)
  }px, ${settingsPanelOffset.y + (settingsDrawerOpen ? 0 : 8)}px, 0) scale(${
    settingsDrawerOpen ? 1 : 0.985
  })`;

  return (
    <div ref={hudRootRef} className={`hud-root ${isMobileLayout ? "mobile" : "desktop"}`}>
      <div className="hud-card">
        <div className="hud-title">NEBULA CUBE</div>
        <div className="hud-turn">{turnText}</div>
        {showTurnClock ? (
          <div className={`hud-turn-clock ${turnUrgent ? "urgent" : ""}`}>
            {turn === myMark ? "你的回合" : "对手回合"} · 剩余 {turnRemainingSeconds}s（以服务器结算为准）
          </div>
        ) : null}
        {showMinimalConnectionSpotlight ? (
          <div className={`hud-spotlight-note ${connectionSpotlightToneClass}`}>
            {connectionGuidance.primaryHint}
          </div>
        ) : null}
        {showMinimalReconnectSpotlight ? (
          <div className={`hud-reconnect-banner ${reconnectUrgent ? "urgent" : ""}`}>
            对手掉线，{reconnectDeadlineSeconds}s 内重连，否则自动判负
          </div>
        ) : null}
        {showMinimalOnboarding ? (
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
                <button className="hud-mini-button active" type="button" onClick={onOnboardingPrimaryAction}>
                  {onboardingGuide.primaryActionLabel}
                </button>
              ) : null}
              <button className="hud-mini-button" type="button" onClick={onOnboardingSkip}>
                跳过引导
              </button>
            </div>
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
              {prevLayerLabel}
            </button>
            <button
              className="hud-mini-button"
              type="button"
              onClick={() => onLayerStep(1)}
              disabled={!layerQuickNav.canGoNext}
            >
              {nextLayerLabel}
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
        <SmartActionBar action={primaryAction} onAction={onPrimaryAction} layoutMode={layoutMode} />
        {assistEnabled ? (
          <div className="hud-actions hud-assist-actions">
            <button className="hud-mini-button" type="button" onClick={onToggleAssist}>
              关闭提示
            </button>
          </div>
        ) : null}
        <div className="hud-actions">
          <button className="hud-button ghost" type="button" onClick={onOpenSettings}>
            设置
          </button>
        </div>
      </div>
      {settingsPanelMounted ? (
        <div
          ref={settingsDrawerRef}
          className={`hud-settings-drawer ${settingsDrawerStateClass} ${settingsPanelDragging ? "is-dragging" : ""}`}
          style={{ transform: settingsDrawerTransform }}
          role="dialog"
          aria-label="设置面板"
        >
          <div
            className="hud-settings-header"
            onPointerDown={handleSettingsDragStart}
            onPointerMove={handleSettingsDragMove}
            onPointerUp={stopSettingsDrag}
            onPointerCancel={stopSettingsDrag}
          >
            <div className="hud-settings-header-title">
              <span>设置</span>
              {!isMobileLayout ? <span className="hud-settings-drag-tip">拖动</span> : null}
            </div>
            <button
              className="hud-settings-close"
              type="button"
              aria-label="关闭设置"
              onClick={onCloseSettings}
            >
              ×
            </button>
          </div>
          <div className="hud-advanced-panel">
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
              <span>{connectionGuidance.statusLabel}</span>
            </div>
            <div className="hud-row">
              <span>你</span>
              <span>{myConnected ? "在线" : "掉线"}</span>
            </div>
            <div className="hud-row">
              <span>对手</span>
              <span>{opponentConnected ? "在线" : "掉线"}</span>
            </div>
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
              <span>冷静模式</span>
              <span>{calmModeActive ? "已触发" : "未触发"}</span>
            </div>
            <div className="hud-row">
              <span>启动渲染</span>
              <span>{renderBootstrapPhase === "boot" ? "稳帧启动中" : "完整特效"}</span>
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
                <span className="hud-setting-label">切换上层按键</span>
                <input
                  className="hud-hotkey-input"
                  type="text"
                  maxLength={1}
                  value={layerHotkeys.up}
                  onChange={(event) => onLayerHotkeyChange("up", event.target.value)}
                />
              </div>
              <div className="hud-setting-row">
                <span className="hud-setting-label">切换下层按键</span>
                <input
                  className="hud-hotkey-input"
                  type="text"
                  maxLength={1}
                  value={layerHotkeys.down}
                  onChange={(event) => onLayerHotkeyChange("down", event.target.value)}
                />
              </div>
              <div className="hud-setting-row">
                <span className="hud-setting-label">快捷键默认值</span>
                <button className="hud-mini-button" type="button" onClick={onResetLayerHotkeys}>
                  恢复 d / a
                </button>
              </div>
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
              {autoRematchCanCancel ? (
                <div className="hud-setting-row">
                  <span className="hud-setting-label">连战倒计时</span>
                  <button className="hud-mini-button" type="button" onClick={onCancelAutoRematch}>
                    取消自动准备
                  </button>
                </div>
              ) : null}
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
              {autoContinueCanCancel ? (
                <div className="hud-setting-row">
                  <span className="hud-setting-label">自动继续</span>
                  <button className="hud-mini-button" type="button" onClick={onCancelAutoContinue}>
                    取消自动继续
                  </button>
                </div>
              ) : null}
              {canRematch ? (
                <div className="hud-setting-row">
                  <span className="hud-setting-label">结算操作</span>
                  <button className="hud-mini-button active" type="button" onClick={onRematch}>
                    再来一局
                  </button>
                </div>
              ) : null}
              {canSurrender ? (
                <div className="hud-setting-row">
                  <span className="hud-setting-label">对局操作</span>
                  <button className="hud-mini-button danger" type="button" onClick={onSurrender}>
                    认输
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
                {prevLayerLabel}
              </button>
              <button
                className="hud-mini-button"
                type="button"
                onClick={() => onLayerStep(1)}
                disabled={focusLayer >= boardSize - 1}
              >
                {nextLayerLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
