import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Coordinate3D, PlayerMark, RoomSnapshot } from "../network/protocol";
import { playDropSfx, playTurnNudgeSfx, playWinSfx } from "../audio/sfx";
import type { BoardCell } from "../game/engine/board";
import { analyzeMoveHints, type MoveHint } from "../game/engine/moveHints";
import { createWinLinesIndex } from "../game/engine/winLines";
import { shouldBlockGlobalSpaceHotkey } from "../game/interaction/hotkey";
import { detectLayoutMode, type LayoutMode } from "../game/interaction/deviceMode";
import {
  DEFAULT_QUALITY_LEVEL,
  getQualityProfile,
  selectQualityLevel,
  type QualityLevel,
  type QualityMode
} from "../game/interaction/qualityProfile";
import type { TimeoutAssistNetworkTier } from "../game/interaction/networkLatency";
import {
  createAutoRematchRoundKey,
  evaluateAutoRematch
} from "../game/interaction/autoRematch";
import {
  createAutoContinueAfterFallbackRoundKey,
  evaluateAutoContinueAfterFallback
} from "../game/interaction/autoContinueAfterFallback";
import {
  evaluateRematchWait,
  resolveRematchWaitStartedAtMs
} from "../game/interaction/rematchWait";
import {
  createDefaultOnboardingProgress,
  createOnboardingGuideState,
  isOnboardingCompletedByPlayer
} from "../game/interaction/onboardingGuide";
import { createSmartActionState } from "../game/interaction/smartAction";
import {
  createTimeoutAssistTurnKey,
  evaluateTimeoutAssist
} from "../game/interaction/timeoutAssist";
import {
  createTurnNudgeTurnKey,
  shouldTriggerTurnNudge
} from "../game/interaction/turnNudge";
import {
  evaluateTurnNudgePermission,
  TURN_NUDGE_PERMISSION_SNOOZE_MS,
  type TurnNudgeNotificationPermission
} from "../game/interaction/turnNudgePermission";
import {
  createFocusGuardTurnKey,
  evaluateFocusGuard
} from "../game/interaction/focusGuard";
import {
  createLayerTapLock,
  evaluateLayerTapLock,
  type LayerTapLock
} from "../game/interaction/layerTapLock";
import { createPrimaryIntentState } from "../game/interaction/primaryIntent";
import { evaluateHudSpotlight } from "../game/interaction/hudSpotlight";
import { evaluateLayerQuickNav } from "../game/interaction/layerQuickNav";
import {
  createWinLineDirectorRoundKey,
  evaluateWinLineDirector
} from "../game/interaction/winLineDirector";
import { BoardScene } from "../ui/BoardScene";
import { HUD } from "../ui/HUD";

interface GameRoomPageProps {
  snapshot: RoomSnapshot;
  myMark: PlayerMark;
  connectionStatus: "connecting" | "online" | "reconnecting" | "offline";
  shouldShowOnboarding: boolean;
  qualityMode: QualityMode;
  onQualityModeChange: (mode: QualityMode) => void;
  pendingMove: {
    coordinate: Coordinate3D;
    player: PlayerMark;
  } | null;
  errorMessage: string | null;
  onPlace: (coordinate: Coordinate3D) => void;
  onRematch: () => void;
  onRematchCancel: () => void;
  onContinueMatch: () => void;
  continueSubmitting: boolean;
  onCompleteOnboarding: () => void;
  timeoutAssistEnabled: boolean;
  onTimeoutAssistEnabledChange: (enabled: boolean) => void;
  timeoutAssistThresholdMs: number;
  timeoutAssistNetworkTier: TimeoutAssistNetworkTier;
  autoRematchEnabled: boolean;
  onAutoRematchEnabledChange: (enabled: boolean) => void;
  turnNudgeEnabled: boolean;
  onTurnNudgeEnabledChange: (enabled: boolean) => void;
  turnNudgePermissionSnoozedUntilMs: number | null;
  onTurnNudgePermissionSnoozedUntilMsChange: (snoozedUntilMs: number | null) => void;
  onLeave: () => void;
}

function clampLayer(layer: number, size: number): number {
  return Math.max(0, Math.min(size - 1, layer));
}

function clampOpacity(opacity: number): number {
  return Math.max(0.02, Math.min(1, opacity));
}

function initialQualityLevelFromMode(mode: QualityMode): QualityLevel {
  if (mode === "quality") {
    return "ultra";
  }
  if (mode === "smooth") {
    return "low";
  }
  return DEFAULT_QUALITY_LEVEL;
}

function resolveTurnNudgeNotificationPermission(): TurnNudgeNotificationPermission {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  return Notification.permission;
}

const WIN_LINE_CINEMATIC_DURATION_MS = 2200;
const LAYER_NAV_INPUT_THROTTLE_MS = 170;
const LAYER_TAP_LOCK_TTL_MS = 3500;

export function GameRoomPage({
  snapshot,
  myMark,
  connectionStatus,
  shouldShowOnboarding,
  qualityMode,
  onQualityModeChange,
  pendingMove,
  errorMessage,
  onPlace,
  onRematch,
  onRematchCancel,
  onContinueMatch,
  continueSubmitting,
  onCompleteOnboarding,
  timeoutAssistEnabled,
  onTimeoutAssistEnabledChange,
  timeoutAssistThresholdMs,
  timeoutAssistNetworkTier,
  autoRematchEnabled,
  onAutoRematchEnabledChange,
  turnNudgeEnabled,
  onTurnNudgeEnabledChange,
  turnNudgePermissionSnoozedUntilMs,
  onTurnNudgePermissionSnoozedUntilMsChange,
  onLeave
}: GameRoomPageProps) {
  const lastMoveNumberRef = useRef(0);
  const winnerRef = useRef(snapshot.winner);
  const onboardingCompletionSentRef = useRef(false);
  const onboardingActivatedRef = useRef(false);
  const timeoutAssistTurnKeyRef = useRef<string | null>(null);
  const autoRematchTriggeredRoundKeyRef = useRef<string | null>(null);
  const autoRematchCancelledRoundKeyRef = useRef<string | null>(null);
  const autoContinueTriggeredRoundKeyRef = useRef<string | null>(null);
  const autoContinueCancelledRoundKeyRef = useRef<string | null>(null);
  const winLineDirectorTriggeredRoundKeyRef = useRef<string | null>(null);
  const winLineDirectorTimerRef = useRef<number | null>(null);
  const focusGuardTriggeredTurnKeyRef = useRef<string | null>(null);
  const timeoutAssistJumpToLockKeyRef = useRef<string | null>(null);
  const focusGuardWasMyTurnRef = useRef(snapshot.turn === myMark && snapshot.winner === null);
  const layerNavLastInputAtMsRef = useRef(0);
  const layerNavLastRotateAtMsRef = useRef(0);
  const turnNudgeTriggeredTurnKeyRef = useRef<string | null>(null);
  const turnNudgeTitleActiveRef = useRef(false);
  const wasMyTurnRef = useRef(snapshot.turn === myMark && snapshot.winner === null);
  const baseDocumentTitleRef = useRef(
    typeof document === "undefined" ? "NEBULA CUBE" : document.title
  );
  const [assistEnabled, setAssistEnabled] = useState(false);
  const [onboardingProgress, setOnboardingProgress] = useState(() =>
    createDefaultOnboardingProgress()
  );
  const [focusMode, setFocusMode] = useState<"auto" | "manual">("auto");
  const [focusLayer, setFocusLayer] = useState(Math.floor(snapshot.size / 2));
  const [nonFocusLayerOpacity, setNonFocusLayerOpacity] = useState(0.22);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    if (typeof window === "undefined") {
      return "desktop";
    }
    return detectLayoutMode(window);
  });
  const [qualityLevel, setQualityLevel] = useState<QualityLevel>(() =>
    initialQualityLevelFromMode(qualityMode)
  );
  const [qualityLastSwitchAtMs, setQualityLastSwitchAtMs] = useState<number>(0);
  const [averageFps, setAverageFps] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [pageVisible, setPageVisible] = useState<boolean>(() =>
    typeof document === "undefined" ? true : document.visibilityState === "visible"
  );
  const [windowFocused, setWindowFocused] = useState<boolean>(() =>
    typeof document === "undefined" ? true : document.hasFocus()
  );
  const [turnNudgeNotificationPermission, setTurnNudgeNotificationPermission] =
    useState<TurnNudgeNotificationPermission>(() => resolveTurnNudgeNotificationPermission());
  const [turnNudgePermissionRequestPending, setTurnNudgePermissionRequestPending] = useState(false);
  const [turnNudgePermissionLastRequestedAtMs, setTurnNudgePermissionLastRequestedAtMs] = useState<
    number | null
  >(null);
  const [winLineCinematicActive, setWinLineCinematicActive] = useState(false);
  const [settlementStartedAtMs, setSettlementStartedAtMs] = useState<number | null>(null);
  const [autoRematchCountdownStartedAtMs, setAutoRematchCountdownStartedAtMs] = useState<number | null>(
    null
  );
  const [autoContinueCountdownStartedAtMs, setAutoContinueCountdownStartedAtMs] = useState<
    number | null
  >(null);
  const [layerTapLock, setLayerTapLock] = useState<LayerTapLock | null>(null);
  const [opponentMoveCue, setOpponentMoveCue] = useState<{
    coordinate: Coordinate3D;
    moveNumber: number;
  } | null>(null);
  const opponentMark: PlayerMark = myMark === "X" ? "O" : "X";
  const opponentConnected = snapshot.players[opponentMark].connected;
  const opponentReconnectDeadlineAt = snapshot.players[opponentMark].reconnectDeadlineAt;
  const turnDeadlineAt = snapshot.turnDeadlineAt;
  const myRematchReady = snapshot.rematchReady[myMark];
  const opponentRematchReady = snapshot.rematchReady[opponentMark];
  const hasPendingMove = pendingMove !== null;
  const canPlace =
    snapshot.turn === myMark && !snapshot.winner && connectionStatus === "online" && !hasPendingMove;
  const canContinueMatchByOffline = Boolean(snapshot.winner && !opponentConnected);
  const boardCells = snapshot.board as BoardCell[];
  const hintsWinLinesIndex = useMemo(
    () => createWinLinesIndex(snapshot.size, snapshot.connect),
    [snapshot.connect, snapshot.size]
  );

  const hintResult = useMemo(() => {
    if (!assistEnabled || !canPlace) {
      return {
        winningMoves: [] as MoveHint[],
        blockingMoves: [] as MoveHint[],
        recommendedMoves: [] as MoveHint[]
      };
    }
    return analyzeMoveHints(
      boardCells,
      myMark,
      snapshot.size,
      snapshot.connect,
      3,
      hintsWinLinesIndex
    );
  }, [assistEnabled, boardCells, canPlace, hintsWinLinesIndex, myMark, snapshot.connect, snapshot.size]);

  const primaryHint = hintResult.recommendedMoves[0] ?? null;
  const hintMovesForBoard = assistEnabled && canPlace ? hintResult.recommendedMoves : [];
  const autoFocusLayer = useMemo(() => {
    if (primaryHint) {
      return primaryHint.coordinate.z;
    }
    if (snapshot.lastMove) {
      return snapshot.lastMove.z;
    }
    return Math.floor(snapshot.size / 2);
  }, [primaryHint, snapshot.lastMove, snapshot.size]);
  const layerQuickNav = useMemo(
    () =>
      evaluateLayerQuickNav({
        focusLayer,
        boardSize: snapshot.size,
        hintMoves: hintMovesForBoard,
        lastMove: snapshot.lastMove,
        autoFocusLayer
      }),
    [autoFocusLayer, focusLayer, hintMovesForBoard, snapshot.lastMove, snapshot.size]
  );
  const rematchWaitDecision = useMemo(
    () =>
      evaluateRematchWait({
        winner: snapshot.winner,
        myRematchReady,
        opponentRematchReady,
        opponentConnected,
        settlementStartedAtMs,
        nowMs
      }),
    [
      myRematchReady,
      nowMs,
      opponentRematchReady,
      opponentConnected,
      settlementStartedAtMs,
      snapshot.winner
    ]
  );
  const canContinueMatchByReadyTimeout = rematchWaitDecision.canForceContinueMatch;
  const canContinueMatch = canContinueMatchByOffline || canContinueMatchByReadyTimeout;
  const continueMatchReason =
    canContinueMatchByOffline ? "opponentOffline" : canContinueMatchByReadyTimeout ? "readyTimeout" : null;
  const smartAction = useMemo(
    () =>
      createSmartActionState({
        snapshot: {
          turn: snapshot.turn,
          winner: snapshot.winner
        },
        myMark,
        hints: hintMovesForBoard,
        connectionStatus,
        assistEnabled,
        hasPendingMove,
        canContinueMatch,
        continueMatchReason,
        continueSubmitting,
        myRematchReady,
        opponentRematchReady
      }),
    [
      assistEnabled,
      canContinueMatch,
      continueMatchReason,
      connectionStatus,
      hasPendingMove,
      hintMovesForBoard,
      myMark,
      myRematchReady,
      opponentRematchReady,
      continueSubmitting,
      snapshot.turn,
      snapshot.winner
    ]
  );
  const layerTapLockDecision = useMemo(
    () =>
      evaluateLayerTapLock({
        lock: layerTapLock,
        nowMs,
        canPlace,
        board: snapshot.board,
        boardSize: snapshot.size
      }),
    [canPlace, layerTapLock, nowMs, snapshot.board, snapshot.size]
  );
  const activeLayerTapLock = layerTapLockDecision.lock;
  const tapLockRemainingMs =
    activeLayerTapLock === null ? null : Math.max(0, activeLayerTapLock.expiresAtMs - nowMs);
  const isTapLockVisible =
    activeLayerTapLock !== null && (focusLayer === null || activeLayerTapLock.coordinate.z === focusLayer);
  const primaryIntent = useMemo(
    () =>
      createPrimaryIntentState({
        smartAction,
        layerTapLockDecision,
        focusLayer
      }),
    [focusLayer, layerTapLockDecision, smartAction]
  );
  const onboardingGuide = useMemo(
    () =>
      createOnboardingGuideState({
        enabled: shouldShowOnboarding,
        canUsePrimaryAction: primaryIntent.enabled,
        progress: onboardingProgress
      }),
    [onboardingProgress, primaryIntent.enabled, shouldShowOnboarding]
  );
  const qualityProfile = useMemo(() => getQualityProfile(qualityLevel), [qualityLevel]);
  const winLineDirector = useMemo(
    () =>
      evaluateWinLineDirector({
        winningLine: snapshot.winningLine,
        size: snapshot.size,
        preferReducedMotion: qualityMode === "smooth" || qualityLevel === "low"
      }),
    [qualityLevel, qualityMode, snapshot.size, snapshot.winningLine]
  );
  const winLineDirectorRoundKey = useMemo(
    () =>
      createWinLineDirectorRoundKey({
        roomId: snapshot.roomId,
        winner: snapshot.winner,
        lastMoveNumber: snapshot.lastMove?.moveNumber ?? null,
        lastMoveTimestamp: snapshot.lastMove?.timestamp ?? null
      }),
    [snapshot.lastMove?.moveNumber, snapshot.lastMove?.timestamp, snapshot.roomId, snapshot.winner]
  );
  const isMyTurn = snapshot.turn === myMark && snapshot.winner === null;
  const turnRemainingMs = useMemo(() => {
    if (snapshot.winner || turnDeadlineAt === null) {
      return null;
    }
    return Math.max(0, turnDeadlineAt - nowMs);
  }, [nowMs, snapshot.winner, turnDeadlineAt]);
  const focusGuardTurnKey = useMemo(
    () =>
      createFocusGuardTurnKey({
        roomId: snapshot.roomId,
        turn: snapshot.turn,
        lastMoveNumber: snapshot.lastMove?.moveNumber ?? null,
        turnDeadlineAt
      }),
    [snapshot.lastMove?.moveNumber, snapshot.roomId, snapshot.turn, turnDeadlineAt]
  );
  const turnNudgeTurnKey = useMemo(
    () =>
      createTurnNudgeTurnKey({
        roomId: snapshot.roomId,
        turn: snapshot.turn,
        winner: snapshot.winner,
        lastMoveNumber: snapshot.lastMove?.moveNumber ?? null,
        turnDeadlineAt
      }),
    [snapshot.lastMove?.moveNumber, snapshot.roomId, snapshot.turn, snapshot.winner, turnDeadlineAt]
  );
  const turnNudgePermissionDecision = useMemo(
    () =>
      evaluateTurnNudgePermission({
        enabled: turnNudgeEnabled,
        permission: turnNudgeNotificationPermission,
        snoozedUntilMs: turnNudgePermissionSnoozedUntilMs,
        requestPending: turnNudgePermissionRequestPending,
        lastRequestedAtMs: turnNudgePermissionLastRequestedAtMs,
        nowMs
      }),
    [
      nowMs,
      turnNudgeEnabled,
      turnNudgeNotificationPermission,
      turnNudgePermissionSnoozedUntilMs,
      turnNudgePermissionLastRequestedAtMs,
      turnNudgePermissionRequestPending
    ]
  );
  const timeoutAssistTurnKey = useMemo(
    () =>
      createTimeoutAssistTurnKey({
        roomId: snapshot.roomId,
        turn: snapshot.turn,
        lastMoveNumber: snapshot.lastMove?.moveNumber ?? null,
        turnDeadlineAt
      }),
    [snapshot.lastMove?.moveNumber, snapshot.roomId, snapshot.turn, turnDeadlineAt]
  );
  const timeoutAssistAlreadyTriggered = timeoutAssistTurnKeyRef.current === timeoutAssistTurnKey;
  const timeoutAssistDecision = useMemo(
    () =>
      evaluateTimeoutAssist({
        enabled: timeoutAssistEnabled,
        turnRemainingMs,
        canPlace,
        hasPendingMove,
        hasHiddenConfirmableLock: activeLayerTapLock !== null && layerTapLockDecision.canConfirm && !isTapLockVisible,
        smartAction: primaryIntent,
        alreadyTriggeredThisTurn: timeoutAssistAlreadyTriggered,
        thresholdMs: timeoutAssistThresholdMs
      }),
    [
      activeLayerTapLock,
      isTapLockVisible,
      layerTapLockDecision.canConfirm,
      timeoutAssistAlreadyTriggered,
      timeoutAssistEnabled,
      turnRemainingMs,
      canPlace,
      hasPendingMove,
      primaryIntent,
      timeoutAssistThresholdMs
    ]
  );
  const autoRematchRoundKey = useMemo(
    () =>
      createAutoRematchRoundKey({
        roomId: snapshot.roomId,
        winner: snapshot.winner,
        lastMoveNumber: snapshot.lastMove?.moveNumber ?? null,
        lastMoveTimestamp: snapshot.lastMove?.timestamp ?? null
      }),
    [snapshot.lastMove?.moveNumber, snapshot.lastMove?.timestamp, snapshot.roomId, snapshot.winner]
  );
  const autoRematchDecision = useMemo(
    () =>
      evaluateAutoRematch({
        enabled: autoRematchEnabled,
        winner: snapshot.winner,
        opponentConnected,
        canContinueMatch,
        myRematchReady,
        countdownStartedAtMs: autoRematchCountdownStartedAtMs,
        nowMs,
        alreadyCancelled: autoRematchCancelledRoundKeyRef.current === autoRematchRoundKey,
        alreadyTriggered: autoRematchTriggeredRoundKeyRef.current === autoRematchRoundKey
      }),
    [
      autoRematchCountdownStartedAtMs,
      autoRematchEnabled,
      autoRematchRoundKey,
      canContinueMatch,
      myRematchReady,
      nowMs,
      opponentConnected,
      snapshot.winner
    ]
  );
  const autoContinueRoundKey = useMemo(
    () =>
      createAutoContinueAfterFallbackRoundKey({
        roomId: snapshot.roomId,
        winner: snapshot.winner,
        lastMoveNumber: snapshot.lastMove?.moveNumber ?? null,
        lastMoveTimestamp: snapshot.lastMove?.timestamp ?? null
      }),
    [snapshot.lastMove?.moveNumber, snapshot.lastMove?.timestamp, snapshot.roomId, snapshot.winner]
  );
  const autoContinueDecision = useMemo(
    () =>
      evaluateAutoContinueAfterFallback({
        enabled: autoRematchEnabled,
        rematchWaitPhase: rematchWaitDecision.phase,
        canContinueMatch,
        continueSubmitting,
        countdownStartedAtMs: autoContinueCountdownStartedAtMs,
        nowMs,
        alreadyCancelled: autoContinueCancelledRoundKeyRef.current === autoContinueRoundKey,
        alreadyTriggered: autoContinueTriggeredRoundKeyRef.current === autoContinueRoundKey
      }),
    [
      autoContinueCountdownStartedAtMs,
      autoContinueRoundKey,
      autoRematchEnabled,
      canContinueMatch,
      continueSubmitting,
      nowMs,
      rematchWaitDecision.phase
    ]
  );
  const turnUrgent = turnRemainingMs !== null && turnRemainingMs <= 8_000;
  const opponentReconnectRemainingMs = useMemo(() => {
    if (snapshot.winner || opponentReconnectDeadlineAt === null) {
      return null;
    }
    return Math.max(0, opponentReconnectDeadlineAt - nowMs);
  }, [nowMs, opponentReconnectDeadlineAt, snapshot.winner]);
  const showTurnCountdown = !snapshot.winner && turnRemainingMs !== null;
  const showTimeoutAssistHint = !snapshot.winner && snapshot.turn === myMark;
  const showWinLineSummary = Boolean(snapshot.winner && snapshot.winner !== "draw" && winLineDirector);
  const showAutoRematchHint = Boolean(snapshot.winner) && opponentConnected;
  const showAutoContinueHint =
    Boolean(snapshot.winner) && rematchWaitDecision.phase === "fallback-ready" && autoRematchEnabled;
  const showRematchWaitHint =
    Boolean(snapshot.winner) &&
    myRematchReady &&
    opponentConnected &&
    !opponentRematchReady &&
    rematchWaitDecision.phase !== "idle" &&
    !showAutoContinueHint;
  const showRematchReadyCheck = Boolean(snapshot.winner) && opponentConnected;
  const showReconnectDeadline = !snapshot.winner && opponentReconnectRemainingMs !== null && !opponentConnected;
  const reconnectUrgent =
    opponentReconnectRemainingMs !== null && Math.ceil(opponentReconnectRemainingMs / 1000) <= 10;
  const hudSpotlight = useMemo(
    () =>
      evaluateHudSpotlight({
        connectionStatus,
        showReconnectDeadline,
        reconnectUrgent,
        showTurnCountdown,
        turnUrgent,
        showTimeoutAssistHint,
        timeoutAssistUrgency: timeoutAssistDecision.urgencyLabel,
        showWinLineSummary,
        winLineCinematicActive,
        showAutoRematchHint,
        autoRematchPhase: autoRematchDecision.phase,
        showAutoContinueHint,
        autoContinuePhase: autoContinueDecision.phase,
        showRematchWaitHint,
        showRematchReadyCheck,
        turnNudgePermissionPhase: turnNudgePermissionDecision.phase,
        onboardingVisible: onboardingGuide.visible
      }),
    [
      autoContinueDecision.phase,
      autoRematchDecision.phase,
      autoRematchEnabled,
      connectionStatus,
      myMark,
      myRematchReady,
      onboardingGuide.visible,
      opponentConnected,
      opponentReconnectRemainingMs,
      opponentRematchReady,
      rematchWaitDecision.phase,
      showAutoContinueHint,
      showAutoRematchHint,
      showReconnectDeadline,
      showRematchReadyCheck,
      showRematchWaitHint,
      showTimeoutAssistHint,
      showTurnCountdown,
      showWinLineSummary,
      snapshot.turn,
      snapshot.winner,
      timeoutAssistDecision.urgencyLabel,
      turnNudgePermissionDecision.phase,
      turnRemainingMs,
      turnUrgent,
      winLineCinematicActive
    ]
  );
  const clearWinLineCinematicTimer = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (winLineDirectorTimerRef.current !== null) {
      window.clearTimeout(winLineDirectorTimerRef.current);
      winLineDirectorTimerRef.current = null;
    }
  }, []);
  const stopWinLineCinematic = useCallback(() => {
    clearWinLineCinematicTimer();
    setWinLineCinematicActive(false);
  }, [clearWinLineCinematicTimer]);
  const handleContinueMatchAction = useCallback(() => {
    stopWinLineCinematic();
    onContinueMatch();
  }, [onContinueMatch, stopWinLineCinematic]);
  const handleRematchAction = useCallback(() => {
    stopWinLineCinematic();
    onRematch();
  }, [onRematch, stopWinLineCinematic]);

  const handleToggleTimeoutAssist = useCallback(() => {
    onTimeoutAssistEnabledChange(!timeoutAssistEnabled);
  }, [onTimeoutAssistEnabledChange, timeoutAssistEnabled]);
  const handleToggleTurnNudge = useCallback(() => {
    onTurnNudgeEnabledChange(!turnNudgeEnabled);
  }, [onTurnNudgeEnabledChange, turnNudgeEnabled]);
  const syncTurnNudgeNotificationPermission = useCallback(() => {
    setTurnNudgeNotificationPermission(resolveTurnNudgeNotificationPermission());
  }, []);
  const handleRequestTurnNudgePermission = useCallback(async () => {
    if (typeof window === "undefined" || typeof Notification === "undefined") {
      setTurnNudgeNotificationPermission("unsupported");
      return;
    }
    if (!turnNudgePermissionDecision.canRequest || Notification.permission !== "default") {
      syncTurnNudgeNotificationPermission();
      return;
    }

    setTurnNudgePermissionRequestPending(true);
    setTurnNudgePermissionLastRequestedAtMs(Date.now());
    try {
      const permission = await Notification.requestPermission();
      setTurnNudgeNotificationPermission(permission);
    } catch {
      syncTurnNudgeNotificationPermission();
    } finally {
      setTurnNudgePermissionRequestPending(false);
    }
  }, [syncTurnNudgeNotificationPermission, turnNudgePermissionDecision.canRequest]);
  const handleDismissTurnNudgePermissionHint = useCallback(() => {
    onTurnNudgePermissionSnoozedUntilMsChange(Date.now() + TURN_NUDGE_PERMISSION_SNOOZE_MS);
  }, [onTurnNudgePermissionSnoozedUntilMsChange]);
  const handleCancelAutoRematch = useCallback(() => {
    if (!snapshot.winner) {
      return;
    }
    autoRematchCancelledRoundKeyRef.current = autoRematchRoundKey;
    setAutoRematchCountdownStartedAtMs(null);
    onRematchCancel();
  }, [autoRematchRoundKey, onRematchCancel, snapshot.winner]);
  const handleCancelAutoContinue = useCallback(() => {
    if (!snapshot.winner) {
      return;
    }
    autoContinueCancelledRoundKeyRef.current = autoContinueRoundKey;
    setAutoContinueCountdownStartedAtMs(null);
  }, [autoContinueRoundKey, snapshot.winner]);
  const handleToggleAutoRematch = useCallback(() => {
    const nextEnabled = !autoRematchEnabled;
    onAutoRematchEnabledChange(nextEnabled);
    if (!nextEnabled && autoRematchDecision.canCancel) {
      handleCancelAutoRematch();
    }
  }, [
    autoRematchDecision.canCancel,
    autoRematchEnabled,
    handleCancelAutoRematch,
    onAutoRematchEnabledChange
  ]);

  const handleBoardRotate = useCallback(() => {
    layerNavLastRotateAtMsRef.current = Date.now();
    stopWinLineCinematic();
    if (!shouldShowOnboarding) {
      return;
    }
    setOnboardingProgress((current) =>
      current.hasRotated
        ? current
        : {
            ...current,
            hasRotated: true
          }
    );
  }, [shouldShowOnboarding, stopWinLineCinematic]);

  const handleOnboardingPrimaryAction = useCallback(() => {
    setOnboardingProgress((current) =>
      current.introAcknowledged
        ? current
        : {
            ...current,
            introAcknowledged: true
          }
    );
  }, []);

  const handleOnboardingSkip = useCallback(() => {
    setOnboardingProgress((current) =>
      current.skipped
        ? current
        : {
            ...current,
            skipped: true
          }
    );
  }, []);

  const handleLayerStep = useCallback((step: -1 | 1) => {
    layerNavLastInputAtMsRef.current = Date.now();
    setFocusMode("manual");
    setFocusLayer((current) => clampLayer(current + step, snapshot.size));
  }, [snapshot.size]);

  const handleAutoFocus = useCallback(() => {
    setFocusMode("auto");
    setFocusLayer(autoFocusLayer);
  }, [autoFocusLayer]);

  const handleLayerSmartJump = useCallback(() => {
    if (layerQuickNav.smartJumpLayer === focusLayer) {
      return;
    }
    layerNavLastInputAtMsRef.current = Date.now();
    setFocusMode("manual");
    setFocusLayer(layerQuickNav.smartJumpLayer);
  }, [focusLayer, layerQuickNav.smartJumpLayer]);
  const handleRequestFocusLayer = useCallback(
    (targetCoordinate: Coordinate3D) => {
      const clampedLayer = clampLayer(targetCoordinate.z, snapshot.size);
      const now = Date.now();
      layerNavLastInputAtMsRef.current = now;
      setFocusMode("manual");
      setFocusLayer(clampedLayer);
      setLayerTapLock(
        createLayerTapLock({
          coordinate: {
            x: targetCoordinate.x,
            y: targetCoordinate.y,
            z: clampedLayer
          },
          nowMs: now,
          ttlMs: LAYER_TAP_LOCK_TTL_MS
        })
      );
    },
    [snapshot.size]
  );
  const handleClearTapLock = useCallback(() => {
    setLayerTapLock(null);
  }, []);
  const handleJumpToTapLockLayer = useCallback(() => {
    if (!activeLayerTapLock) {
      return;
    }
    if (focusLayer === activeLayerTapLock.coordinate.z) {
      return;
    }
    layerNavLastInputAtMsRef.current = Date.now();
    setFocusMode("manual");
    setFocusLayer(activeLayerTapLock.coordinate.z);
  }, [activeLayerTapLock, focusLayer]);
  const handleConfirmTapLock = useCallback(() => {
    const decision = evaluateLayerTapLock({
      lock: layerTapLock,
      nowMs: Date.now(),
      canPlace,
      board: snapshot.board,
      boardSize: snapshot.size
    });
    if (!decision.lock || !decision.canConfirm) {
      setLayerTapLock(null);
      return;
    }
    stopWinLineCinematic();
    setLayerTapLock(null);
    onPlace(decision.lock.coordinate);
  }, [canPlace, layerTapLock, onPlace, snapshot.board, snapshot.size, stopWinLineCinematic]);
  const handlePrimaryAction = useCallback(() => {
    if (!primaryIntent.enabled) {
      return;
    }
    if (primaryIntent.source === "tap-lock") {
      handleConfirmTapLock();
      return;
    }
    if (primaryIntent.actionType === "continueMatch") {
      handleContinueMatchAction();
      return;
    }
    if (primaryIntent.actionType === "rematch" || primaryIntent.actionType === "opponentReady") {
      handleRematchAction();
      return;
    }
    if (
      primaryIntent.actionType === "win" ||
      primaryIntent.actionType === "block" ||
      primaryIntent.actionType === "suggest"
    ) {
      stopWinLineCinematic();
      if (!primaryIntent.target) {
        return;
      }
      onPlace(primaryIntent.target);
    }
  }, [
    handleConfirmTapLock,
    handleContinueMatchAction,
    handleRematchAction,
    onPlace,
    primaryIntent,
    stopWinLineCinematic
  ]);

  const handleLayerWheel = useCallback(
    (deltaY: number): boolean => {
      const now = Date.now();
      if (
        now - layerNavLastInputAtMsRef.current < LAYER_NAV_INPUT_THROTTLE_MS ||
        now - layerNavLastRotateAtMsRef.current < LAYER_NAV_INPUT_THROTTLE_MS
      ) {
        return false;
      }
      if (Math.abs(deltaY) < 18) {
        return false;
      }
      const step: -1 | 1 = deltaY > 0 ? 1 : -1;
      if ((step === 1 && !layerQuickNav.canGoNext) || (step === -1 && !layerQuickNav.canGoPrev)) {
        return false;
      }
      handleLayerStep(step);
      return true;
    },
    [handleLayerStep, layerQuickNav.canGoNext, layerQuickNav.canGoPrev]
  );

  const handleLayerSwipe = useCallback(
    (deltaY: number) => {
      const now = Date.now();
      if (
        now - layerNavLastInputAtMsRef.current < LAYER_NAV_INPUT_THROTTLE_MS ||
        now - layerNavLastRotateAtMsRef.current < LAYER_NAV_INPUT_THROTTLE_MS
      ) {
        return;
      }
      if (Math.abs(deltaY) < 32) {
        return;
      }
      handleLayerStep(deltaY < 0 ? 1 : -1);
    },
    [handleLayerStep]
  );

  const handleAssistToggle = useCallback(() => {
    setAssistEnabled((current) => !current);
    setFocusMode("auto");
  }, []);
  const handleNonFocusLayerOpacityChange = useCallback((nextOpacity: number) => {
    setNonFocusLayerOpacity(clampOpacity(nextOpacity));
  }, []);

  const handleToggleAdvanced = () => {
    setAdvancedOpen((current) => !current);
  };

  const applyTurnNudgeTitle = useCallback(() => {
    if (typeof document === "undefined" || turnNudgeTitleActiveRef.current) {
      return;
    }
    document.title = `⚡ 轮到你了 · ${baseDocumentTitleRef.current}`;
    turnNudgeTitleActiveRef.current = true;
  }, []);

  const clearTurnNudgeTitle = useCallback(() => {
    if (typeof document === "undefined" || !turnNudgeTitleActiveRef.current) {
      return;
    }
    document.title = baseDocumentTitleRef.current;
    turnNudgeTitleActiveRef.current = false;
  }, []);

  useEffect(() => {
    if (!snapshot.lastMove) {
      lastMoveNumberRef.current = 0;
      setOpponentMoveCue(null);
      return;
    }

    const moveNumber = snapshot.lastMove.moveNumber;
    if (moveNumber <= lastMoveNumberRef.current) {
      return;
    }

    playDropSfx();
    if (snapshot.lastMove.player === opponentMark) {
      setOpponentMoveCue({
        coordinate: {
          x: snapshot.lastMove.x,
          y: snapshot.lastMove.y,
          z: snapshot.lastMove.z
        },
        moveNumber
      });
    }
    lastMoveNumberRef.current = moveNumber;
  }, [opponentMark, snapshot.lastMove]);

  useEffect(() => {
    if (snapshot.winner && snapshot.winner !== winnerRef.current) {
      playWinSfx();
    }
    winnerRef.current = snapshot.winner;
  }, [snapshot.winner]);

  useEffect(() => {
    if (!snapshot.winner || snapshot.winner === "draw" || !winLineDirector) {
      winLineDirectorTriggeredRoundKeyRef.current = null;
      stopWinLineCinematic();
      return;
    }
    if (winLineDirectorTriggeredRoundKeyRef.current === winLineDirectorRoundKey) {
      return;
    }

    winLineDirectorTriggeredRoundKeyRef.current = winLineDirectorRoundKey;
    if (!winLineDirector.shouldAnimate || typeof window === "undefined") {
      stopWinLineCinematic();
      return;
    }

    clearWinLineCinematicTimer();
    setWinLineCinematicActive(true);
    winLineDirectorTimerRef.current = window.setTimeout(() => {
      setWinLineCinematicActive(false);
      winLineDirectorTimerRef.current = null;
    }, WIN_LINE_CINEMATIC_DURATION_MS);
  }, [
    clearWinLineCinematicTimer,
    snapshot.winner,
    stopWinLineCinematic,
    winLineDirector,
    winLineDirectorRoundKey
  ]);

  useEffect(() => () => clearWinLineCinematicTimer(), [clearWinLineCinematicTimer]);

  useEffect(() => {
    setFocusMode("auto");
    setFocusLayer(Math.floor(snapshot.size / 2));
    setAdvancedOpen(false);
  }, [snapshot.roomId, snapshot.size]);

  useEffect(() => {
    onboardingCompletionSentRef.current = false;
    onboardingActivatedRef.current = false;
    lastMoveNumberRef.current = 0;
    timeoutAssistTurnKeyRef.current = null;
    autoRematchTriggeredRoundKeyRef.current = null;
    autoRematchCancelledRoundKeyRef.current = null;
    autoContinueTriggeredRoundKeyRef.current = null;
    autoContinueCancelledRoundKeyRef.current = null;
    winLineDirectorTriggeredRoundKeyRef.current = null;
    focusGuardTriggeredTurnKeyRef.current = null;
    timeoutAssistJumpToLockKeyRef.current = null;
    turnNudgeTriggeredTurnKeyRef.current = null;
    wasMyTurnRef.current = snapshot.turn === myMark && snapshot.winner === null;
    focusGuardWasMyTurnRef.current = snapshot.turn === myMark && snapshot.winner === null;
    clearTurnNudgeTitle();
    stopWinLineCinematic();
    layerNavLastInputAtMsRef.current = 0;
    layerNavLastRotateAtMsRef.current = 0;
    setLayerTapLock(null);
    setSettlementStartedAtMs(null);
    setAutoRematchCountdownStartedAtMs(null);
    setAutoContinueCountdownStartedAtMs(null);
    setOpponentMoveCue(null);
    if (typeof document !== "undefined") {
      setPageVisible(document.visibilityState === "visible");
      setWindowFocused(document.hasFocus());
    }
    setOnboardingProgress(createDefaultOnboardingProgress());
  }, [clearTurnNudgeTitle, snapshot.roomId, stopWinLineCinematic]);

  useEffect(() => {
    setSettlementStartedAtMs((current) =>
      resolveRematchWaitStartedAtMs(
        current,
        {
          winner: snapshot.winner,
          myRematchReady,
          opponentRematchReady,
          opponentConnected
        },
        Date.now()
      )
    );
  }, [myRematchReady, opponentConnected, opponentRematchReady, snapshot.winner]);

  useEffect(() => {
    if (!snapshot.winner) {
      autoRematchTriggeredRoundKeyRef.current = null;
      autoRematchCancelledRoundKeyRef.current = null;
      setAutoRematchCountdownStartedAtMs(null);
      return;
    }
    setAutoRematchCountdownStartedAtMs((current) => {
      if (autoRematchDecision.shouldStartCountdown && current === null) {
        return Date.now();
      }
      if (autoRematchDecision.phase === "idle" || autoRematchDecision.phase === "cancelled") {
        return null;
      }
      return current;
    });
  }, [autoRematchDecision.phase, autoRematchDecision.shouldStartCountdown, snapshot.winner]);

  useEffect(() => {
    if (!snapshot.winner) {
      autoContinueTriggeredRoundKeyRef.current = null;
      autoContinueCancelledRoundKeyRef.current = null;
      setAutoContinueCountdownStartedAtMs(null);
      return;
    }
    setAutoContinueCountdownStartedAtMs((current) => {
      if (autoContinueDecision.shouldStartCountdown && current === null) {
        return Date.now();
      }
      if (autoContinueDecision.phase !== "countdown") {
        return null;
      }
      return current;
    });
  }, [autoContinueDecision.phase, autoContinueDecision.shouldStartCountdown, snapshot.winner]);

  useEffect(() => {
    if (!shouldShowOnboarding || onboardingActivatedRef.current) {
      return;
    }
    onboardingActivatedRef.current = true;
  }, [shouldShowOnboarding]);

  useEffect(() => {
    if (!onboardingActivatedRef.current) {
      return;
    }
    if (!snapshot.lastMove || snapshot.lastMove.player !== myMark) {
      return;
    }
    setOnboardingProgress((current) =>
      current.hasPlaced
        ? current
        : {
            ...current,
            hasPlaced: true
          }
    );
  }, [myMark, snapshot.lastMove]);

  useEffect(() => {
    if (!onboardingActivatedRef.current) {
      return;
    }
    if (!isOnboardingCompletedByPlayer(onboardingProgress)) {
      return;
    }
    if (onboardingCompletionSentRef.current) {
      return;
    }
    onboardingCompletionSentRef.current = true;
    onCompleteOnboarding();
  }, [onCompleteOnboarding, onboardingProgress]);

  useEffect(() => {
    if (timeoutAssistDecision.nextAction === "none") {
      return;
    }
    if (timeoutAssistDecision.nextAction === "jumpToLock") {
      if (!activeLayerTapLock) {
        return;
      }
      const jumpToLockKey = [
        timeoutAssistTurnKey,
        activeLayerTapLock.coordinate.x,
        activeLayerTapLock.coordinate.y,
        activeLayerTapLock.coordinate.z,
        activeLayerTapLock.expiresAtMs
      ].join(":");
      if (timeoutAssistJumpToLockKeyRef.current === jumpToLockKey) {
        return;
      }
      timeoutAssistJumpToLockKeyRef.current = jumpToLockKey;
      handleJumpToTapLockLayer();
      return;
    }
    if (timeoutAssistTurnKeyRef.current === timeoutAssistTurnKey) {
      return;
    }
    timeoutAssistTurnKeyRef.current = timeoutAssistTurnKey;
    handlePrimaryAction();
  }, [
    activeLayerTapLock,
    handleJumpToTapLockLayer,
    handlePrimaryAction,
    timeoutAssistDecision.nextAction,
    timeoutAssistTurnKey
  ]);

  useEffect(() => {
    if (!autoRematchDecision.shouldAutoRematch) {
      return;
    }
    if (autoRematchTriggeredRoundKeyRef.current === autoRematchRoundKey) {
      return;
    }
    autoRematchTriggeredRoundKeyRef.current = autoRematchRoundKey;
    setAutoRematchCountdownStartedAtMs(null);
    handleRematchAction();
  }, [autoRematchDecision.shouldAutoRematch, autoRematchRoundKey, handleRematchAction]);

  useEffect(() => {
    if (!autoContinueDecision.shouldAutoContinue) {
      return;
    }
    if (autoContinueTriggeredRoundKeyRef.current === autoContinueRoundKey) {
      return;
    }
    autoContinueTriggeredRoundKeyRef.current = autoContinueRoundKey;
    setAutoContinueCountdownStartedAtMs(null);
    handleContinueMatchAction();
  }, [autoContinueDecision.shouldAutoContinue, autoContinueRoundKey, handleContinueMatchAction]);

  useEffect(() => {
    const lastManualInputAtMs = Math.max(
      layerNavLastInputAtMsRef.current,
      layerNavLastRotateAtMsRef.current
    );
    const focusGuardDecision = evaluateFocusGuard({
      focusMode,
      currentLayer: focusLayer,
      autoFocusLayer,
      boardSize: snapshot.size,
      isMyTurn,
      wasMyTurn: focusGuardWasMyTurnRef.current,
      turnRemainingMs,
      lastManualInputAtMs: lastManualInputAtMs > 0 ? lastManualInputAtMs : null,
      nowMs,
      alreadyTriggeredThisTurn: focusGuardTriggeredTurnKeyRef.current === focusGuardTurnKey
    });

    if (focusGuardDecision.shouldRestoreAuto) {
      focusGuardTriggeredTurnKeyRef.current = focusGuardTurnKey;
      setFocusMode("auto");
      setFocusLayer(focusGuardDecision.targetLayer);
    }

    focusGuardWasMyTurnRef.current = isMyTurn;
  }, [
    autoFocusLayer,
    focusGuardTurnKey,
    focusLayer,
    focusMode,
    isMyTurn,
    nowMs,
    snapshot.size,
    turnRemainingMs
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleVisibilityChange = () => {
      setPageVisible(document.visibilityState === "visible");
      syncTurnNudgeNotificationPermission();
    };
    const handleFocus = () => {
      setWindowFocused(true);
      syncTurnNudgeNotificationPermission();
    };
    const handleBlur = () => {
      setWindowFocused(false);
    };

    handleVisibilityChange();
    setWindowFocused(document.hasFocus());
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, [syncTurnNudgeNotificationPermission]);

  useEffect(() => {
    const shouldNudge = shouldTriggerTurnNudge({
      enabled: turnNudgeEnabled,
      connectionStatus,
      winner: snapshot.winner,
      isMyTurn,
      wasMyTurn: wasMyTurnRef.current,
      canPlace,
      pageVisible,
      windowFocused,
      alreadyNudgedThisTurn: turnNudgeTriggeredTurnKeyRef.current === turnNudgeTurnKey
    });

    if (shouldNudge) {
      turnNudgeTriggeredTurnKeyRef.current = turnNudgeTurnKey;
      applyTurnNudgeTitle();
      playTurnNudgeSfx();
      if (turnNudgeNotificationPermission === "granted" && typeof window !== "undefined") {
        try {
          new Notification("轮到你了", {
            body: "现在是你的回合，返回战局即可一键落子"
          });
        } catch {}
      }
    }

    if ((!isMyTurn || (pageVisible && windowFocused) || !turnNudgeEnabled) && turnNudgeTitleActiveRef.current) {
      clearTurnNudgeTitle();
    }

    wasMyTurnRef.current = isMyTurn;
  }, [
    applyTurnNudgeTitle,
    canPlace,
    clearTurnNudgeTitle,
    connectionStatus,
    isMyTurn,
    pageVisible,
    snapshot.winner,
    turnNudgeEnabled,
    turnNudgeNotificationPermission,
    turnNudgeTurnKey,
    windowFocused
  ]);

  useEffect(() => {
    return () => {
      clearTurnNudgeTitle();
    };
  }, [clearTurnNudgeTitle]);

  useEffect(() => {
    if (focusMode !== "auto") {
      return;
    }
    setFocusLayer(clampLayer(autoFocusLayer, snapshot.size));
  }, [autoFocusLayer, focusMode, snapshot.size]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const updateLayoutMode = () => {
      setLayoutMode(detectLayoutMode(window));
    };

    updateLayoutMode();
    window.addEventListener("resize", updateLayoutMode);
    return () => window.removeEventListener("resize", updateLayoutMode);
  }, []);

  useEffect(() => {
    if (layoutMode !== "mobile") {
      return;
    }
    setAdvancedOpen(false);
  }, [layoutMode]);

  useEffect(() => {
    let rafId = 0;
    let frameCount = 0;
    let windowStart = performance.now();

    const measure = (now: number) => {
      frameCount += 1;
      const elapsed = now - windowStart;
      if (elapsed >= 1000) {
        setAverageFps((frameCount * 1000) / elapsed);
        frameCount = 0;
        windowStart = now;
      }
      rafId = window.requestAnimationFrame(measure);
    };

    rafId = window.requestAnimationFrame(measure);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!layerTapLock) {
      return;
    }
    if (layerTapLockDecision.lock !== null) {
      return;
    }
    setLayerTapLock(null);
  }, [layerTapLock, layerTapLockDecision.lock]);

  useEffect(() => {
    const nowMs = Date.now();
    const nextLevel = selectQualityLevel({
      mode: qualityMode,
      currentLevel: qualityLevel,
      averageFps,
      nowMs,
      lastSwitchAtMs: qualityLastSwitchAtMs
    });
    if (nextLevel === qualityLevel) {
      return;
    }
    setQualityLevel(nextLevel);
    setQualityLastSwitchAtMs(nowMs);
  }, [averageFps, qualityLastSwitchAtMs, qualityLevel, qualityMode]);

  useEffect(() => {
    if (layoutMode === "mobile") {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) {
        return;
      }
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (shouldBlockGlobalSpaceHotkey(event.target)) {
        return;
      }
      if (!primaryIntent.enabled) {
        return;
      }
      event.preventDefault();
      handlePrimaryAction();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlePrimaryAction, layoutMode, primaryIntent.enabled]);

  const gameToastMessage = errorMessage;

  return (
    <main className={`game-page ${layoutMode === "mobile" ? "mobile" : "desktop"}`}>
      <BoardScene
        layoutMode={layoutMode}
        board={snapshot.board}
        size={snapshot.size}
        canPlace={canPlace}
        nonFocusLayerOpacity={nonFocusLayerOpacity}
        qualityProfile={qualityProfile}
        opponentMoveCue={opponentMoveCue}
        winningLine={snapshot.winningLine}
        winLineCinematicActive={winLineCinematicActive}
        focusLayer={focusLayer}
        tapLockCoordinate={activeLayerTapLock?.coordinate ?? null}
        hintMoves={hintMovesForBoard}
        pendingMove={pendingMove}
        onPlace={onPlace}
        onLayerWheel={handleLayerWheel}
        onLayerSwipe={handleLayerSwipe}
        onUserRotate={handleBoardRotate}
      />
      <HUD
        layoutMode={layoutMode}
        roomId={snapshot.roomId}
        boardSize={snapshot.size}
        myMark={myMark}
        turn={snapshot.turn}
        winner={snapshot.winner}
        hudSpotlight={hudSpotlight}
        winLineSummary={winLineDirector?.lineLabel ?? null}
        winLineCinematicActive={winLineCinematicActive}
        assistEnabled={assistEnabled}
        nonFocusLayerOpacity={nonFocusLayerOpacity}
        focusLayer={focusLayer}
        focusMode={focusMode}
        layerQuickNav={layerQuickNav}
        tapLockCoordinate={activeLayerTapLock?.coordinate ?? null}
        tapLockVisible={isTapLockVisible}
        tapLockRemainingMs={tapLockRemainingMs}
        primaryAction={primaryIntent}
        onboardingGuide={onboardingGuide.visible ? onboardingGuide : null}
        advancedOpen={advancedOpen}
        qualityMode={qualityMode}
        qualityLevel={qualityLevel}
        averageFps={averageFps}
        myConnected={snapshot.players[myMark].connected}
        opponentConnected={opponentConnected}
        turnRemainingMs={turnRemainingMs}
        turnUrgent={turnUrgent}
        timeoutAssistEnabled={timeoutAssistEnabled}
        timeoutAssistUrgency={timeoutAssistDecision.urgencyLabel}
        timeoutAssistNextAction={timeoutAssistDecision.nextAction}
        timeoutAssistThresholdMs={timeoutAssistThresholdMs}
        timeoutAssistNetworkTier={timeoutAssistNetworkTier}
        turnNudgeEnabled={turnNudgeEnabled}
        turnNudgePermissionPhase={turnNudgePermissionDecision.phase}
        turnNudgePermissionCanRequest={turnNudgePermissionDecision.canRequest}
        turnNudgePermissionRequestPending={turnNudgePermissionRequestPending}
        autoRematchEnabled={autoRematchEnabled}
        autoRematchPhase={autoRematchDecision.phase}
        autoRematchCountdownRemainingMs={autoRematchDecision.countdownRemainingMs}
        autoRematchCanCancel={autoRematchDecision.canCancel}
        autoContinuePhase={autoContinueDecision.phase}
        autoContinueCountdownRemainingMs={autoContinueDecision.countdownRemainingMs}
        autoContinueCanCancel={autoContinueDecision.canCancel}
        rematchWaitPhase={rematchWaitDecision.phase}
        rematchWaitRemainingMs={rematchWaitDecision.remainingMs}
        myRematchReady={myRematchReady}
        opponentRematchReady={opponentRematchReady}
        opponentReconnectRemainingMs={opponentReconnectRemainingMs}
        connectionStatus={connectionStatus}
        onPrimaryAction={handlePrimaryAction}
        onToggleTimeoutAssist={handleToggleTimeoutAssist}
        onToggleTurnNudge={handleToggleTurnNudge}
        onRequestTurnNudgePermission={handleRequestTurnNudgePermission}
        onDismissTurnNudgePermissionHint={handleDismissTurnNudgePermissionHint}
        onToggleAutoRematch={handleToggleAutoRematch}
        onCancelAutoRematch={handleCancelAutoRematch}
        onCancelAutoContinue={handleCancelAutoContinue}
        onOnboardingPrimaryAction={handleOnboardingPrimaryAction}
        onOnboardingSkip={handleOnboardingSkip}
        onToggleAdvanced={handleToggleAdvanced}
        onLayerStep={handleLayerStep}
        onLayerSmartJump={handleLayerSmartJump}
        onJumpToTapLockLayer={handleJumpToTapLockLayer}
        onCancelTapLock={handleClearTapLock}
        onAutoFocus={handleAutoFocus}
        onToggleAssist={handleAssistToggle}
        onNonFocusLayerOpacityChange={handleNonFocusLayerOpacityChange}
        onQualityModeChange={onQualityModeChange}
        onRematch={handleRematchAction}
        onLeave={onLeave}
      />
      {gameToastMessage ? <div className="game-toast">{gameToastMessage}</div> : null}
    </main>
  );
}
