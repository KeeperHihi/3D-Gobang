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
  const turnNudgeTriggeredTurnKeyRef = useRef<string | null>(null);
  const turnNudgeTitleActiveRef = useRef(false);
  const wasMyTurnRef = useRef(snapshot.turn === myMark && snapshot.winner === null);
  const baseDocumentTitleRef = useRef(
    typeof document === "undefined" ? "NEBULA CUBE" : document.title
  );
  const [assistEnabled, setAssistEnabled] = useState(true);
  const [onboardingProgress, setOnboardingProgress] = useState(() =>
    createDefaultOnboardingProgress()
  );
  const [focusMode, setFocusMode] = useState<"auto" | "manual">("auto");
  const [focusLayer, setFocusLayer] = useState(Math.floor(snapshot.size / 2));
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
  const [settlementStartedAtMs, setSettlementStartedAtMs] = useState<number | null>(null);
  const [autoRematchCountdownStartedAtMs, setAutoRematchCountdownStartedAtMs] = useState<number | null>(
    null
  );
  const [autoContinueCountdownStartedAtMs, setAutoContinueCountdownStartedAtMs] = useState<
    number | null
  >(null);
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
  const onboardingGuide = useMemo(
    () =>
      createOnboardingGuideState({
        enabled: shouldShowOnboarding,
        canUsePrimaryAction: smartAction.enabled,
        progress: onboardingProgress
      }),
    [onboardingProgress, shouldShowOnboarding, smartAction.enabled]
  );
  const qualityProfile = useMemo(() => getQualityProfile(qualityLevel), [qualityLevel]);
  const isMyTurn = snapshot.turn === myMark && snapshot.winner === null;
  const turnRemainingMs = useMemo(() => {
    if (snapshot.winner || turnDeadlineAt === null) {
      return null;
    }
    return Math.max(0, turnDeadlineAt - nowMs);
  }, [nowMs, snapshot.winner, turnDeadlineAt]);
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
        smartAction,
        alreadyTriggeredThisTurn: timeoutAssistAlreadyTriggered,
        thresholdMs: timeoutAssistThresholdMs
      }),
    [
      timeoutAssistAlreadyTriggered,
      timeoutAssistEnabled,
      turnRemainingMs,
      canPlace,
      hasPendingMove,
      smartAction,
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

  const handlePrimaryAction = useCallback(() => {
    if (!smartAction.enabled) {
      return;
    }
    if (smartAction.actionType === "continueMatch") {
      onContinueMatch();
      return;
    }
    if (smartAction.actionType === "rematch" || smartAction.actionType === "opponentReady") {
      onRematch();
      return;
    }
    if (
      smartAction.actionType === "win" ||
      smartAction.actionType === "block" ||
      smartAction.actionType === "suggest"
    ) {
      if (!smartAction.target) {
        return;
      }
      onPlace(smartAction.target);
    }
  }, [onContinueMatch, onPlace, onRematch, smartAction]);

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
  }, [shouldShowOnboarding]);

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

  const handleLayerStep = (step: -1 | 1) => {
    setFocusMode("manual");
    setFocusLayer((current) => clampLayer(current + step, snapshot.size));
  };

  const handleAutoFocus = () => {
    setFocusMode("auto");
    setFocusLayer(autoFocusLayer);
  };

  const handleAssistToggle = () => {
    setAssistEnabled((current) => !current);
    setFocusMode("auto");
  };

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
    const moveNumber = snapshot.lastMove?.moveNumber ?? 0;
    if (moveNumber > lastMoveNumberRef.current) {
      playDropSfx();
      lastMoveNumberRef.current = moveNumber;
    }
  }, [snapshot.lastMove]);

  useEffect(() => {
    if (snapshot.winner && snapshot.winner !== winnerRef.current) {
      playWinSfx();
    }
    winnerRef.current = snapshot.winner;
  }, [snapshot.winner]);

  useEffect(() => {
    setFocusMode("auto");
    setFocusLayer(Math.floor(snapshot.size / 2));
    setAdvancedOpen(false);
  }, [snapshot.roomId, snapshot.size]);

  useEffect(() => {
    onboardingCompletionSentRef.current = false;
    onboardingActivatedRef.current = false;
    timeoutAssistTurnKeyRef.current = null;
    autoRematchTriggeredRoundKeyRef.current = null;
    autoRematchCancelledRoundKeyRef.current = null;
    autoContinueTriggeredRoundKeyRef.current = null;
    autoContinueCancelledRoundKeyRef.current = null;
    turnNudgeTriggeredTurnKeyRef.current = null;
    wasMyTurnRef.current = snapshot.turn === myMark && snapshot.winner === null;
    clearTurnNudgeTitle();
    setSettlementStartedAtMs(null);
    setAutoRematchCountdownStartedAtMs(null);
    setAutoContinueCountdownStartedAtMs(null);
    if (typeof document !== "undefined") {
      setPageVisible(document.visibilityState === "visible");
      setWindowFocused(document.hasFocus());
    }
    setOnboardingProgress(createDefaultOnboardingProgress());
  }, [clearTurnNudgeTitle, snapshot.roomId]);

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
    if (!timeoutAssistDecision.shouldAutoAct) {
      return;
    }
    if (timeoutAssistTurnKeyRef.current === timeoutAssistTurnKey) {
      return;
    }
    timeoutAssistTurnKeyRef.current = timeoutAssistTurnKey;
    handlePrimaryAction();
  }, [handlePrimaryAction, timeoutAssistDecision.shouldAutoAct, timeoutAssistTurnKey]);

  useEffect(() => {
    if (!autoRematchDecision.shouldAutoRematch) {
      return;
    }
    if (autoRematchTriggeredRoundKeyRef.current === autoRematchRoundKey) {
      return;
    }
    autoRematchTriggeredRoundKeyRef.current = autoRematchRoundKey;
    setAutoRematchCountdownStartedAtMs(null);
    onRematch();
  }, [autoRematchDecision.shouldAutoRematch, autoRematchRoundKey, onRematch]);

  useEffect(() => {
    if (!autoContinueDecision.shouldAutoContinue) {
      return;
    }
    if (autoContinueTriggeredRoundKeyRef.current === autoContinueRoundKey) {
      return;
    }
    autoContinueTriggeredRoundKeyRef.current = autoContinueRoundKey;
    setAutoContinueCountdownStartedAtMs(null);
    onContinueMatch();
  }, [autoContinueDecision.shouldAutoContinue, autoContinueRoundKey, onContinueMatch]);

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
      if (!smartAction.enabled) {
        return;
      }
      event.preventDefault();
      handlePrimaryAction();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlePrimaryAction, layoutMode, smartAction.enabled]);

  return (
    <main className={`game-page ${layoutMode === "mobile" ? "mobile" : "desktop"}`}>
      <BoardScene
        layoutMode={layoutMode}
        board={snapshot.board}
        size={snapshot.size}
        canPlace={canPlace}
        qualityProfile={qualityProfile}
        lastMove={snapshot.lastMove}
        winningLine={snapshot.winningLine}
        focusLayer={focusLayer}
        hintMoves={hintMovesForBoard}
        pendingMove={pendingMove}
        onPlace={onPlace}
        onUserRotate={handleBoardRotate}
      />
      <HUD
        layoutMode={layoutMode}
        roomId={snapshot.roomId}
        boardSize={snapshot.size}
        myMark={myMark}
        turn={snapshot.turn}
        winner={snapshot.winner}
        assistEnabled={assistEnabled}
        focusLayer={focusLayer}
        focusMode={focusMode}
        smartAction={smartAction}
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
        onAutoFocus={handleAutoFocus}
        onToggleAssist={handleAssistToggle}
        onQualityModeChange={onQualityModeChange}
        onRematch={onRematch}
        onLeave={onLeave}
      />
      {errorMessage ? <div className="game-toast">{errorMessage}</div> : null}
    </main>
  );
}
