import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Coordinate3D, PlayerMark, RoomSnapshot } from "../network/protocol";
import { playDropSfx, playWinSfx } from "../audio/sfx";
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
  onCompleteOnboarding: () => void;
  timeoutAssistEnabled: boolean;
  onTimeoutAssistEnabledChange: (enabled: boolean) => void;
  timeoutAssistThresholdMs: number;
  timeoutAssistNetworkTier: TimeoutAssistNetworkTier;
  autoRematchEnabled: boolean;
  onAutoRematchEnabledChange: (enabled: boolean) => void;
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
  onCompleteOnboarding,
  timeoutAssistEnabled,
  onTimeoutAssistEnabledChange,
  timeoutAssistThresholdMs,
  timeoutAssistNetworkTier,
  autoRematchEnabled,
  onAutoRematchEnabledChange,
  onLeave
}: GameRoomPageProps) {
  const lastMoveNumberRef = useRef(0);
  const winnerRef = useRef(snapshot.winner);
  const onboardingCompletionSentRef = useRef(false);
  const onboardingActivatedRef = useRef(false);
  const timeoutAssistTurnKeyRef = useRef<string | null>(null);
  const autoRematchTriggeredRoundKeyRef = useRef<string | null>(null);
  const autoRematchCancelledRoundKeyRef = useRef<string | null>(null);
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
  const [settlementStartedAtMs, setSettlementStartedAtMs] = useState<number | null>(null);
  const [autoRematchCountdownStartedAtMs, setAutoRematchCountdownStartedAtMs] = useState<number | null>(
    null
  );
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
  const turnRemainingMs = useMemo(() => {
    if (snapshot.winner || turnDeadlineAt === null) {
      return null;
    }
    return Math.max(0, turnDeadlineAt - nowMs);
  }, [nowMs, snapshot.winner, turnDeadlineAt]);
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
  const handleCancelAutoRematch = useCallback(() => {
    if (!snapshot.winner) {
      return;
    }
    autoRematchCancelledRoundKeyRef.current = autoRematchRoundKey;
    setAutoRematchCountdownStartedAtMs(null);
    onRematchCancel();
  }, [autoRematchRoundKey, onRematchCancel, snapshot.winner]);
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
    setSettlementStartedAtMs(null);
    setAutoRematchCountdownStartedAtMs(null);
    setOnboardingProgress(createDefaultOnboardingProgress());
  }, [snapshot.roomId]);

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
        autoRematchEnabled={autoRematchEnabled}
        autoRematchPhase={autoRematchDecision.phase}
        autoRematchCountdownRemainingMs={autoRematchDecision.countdownRemainingMs}
        autoRematchCanCancel={autoRematchDecision.canCancel}
        rematchWaitPhase={rematchWaitDecision.phase}
        rematchWaitRemainingMs={rematchWaitDecision.remainingMs}
        myRematchReady={myRematchReady}
        opponentRematchReady={opponentRematchReady}
        opponentReconnectRemainingMs={opponentReconnectRemainingMs}
        connectionStatus={connectionStatus}
        onPrimaryAction={handlePrimaryAction}
        onToggleTimeoutAssist={handleToggleTimeoutAssist}
        onToggleAutoRematch={handleToggleAutoRematch}
        onCancelAutoRematch={handleCancelAutoRematch}
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
