import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import type { Coordinate3D, PlayerMark, RoomSnapshot } from "../network/protocol";
import { playDropSfx, playTurnNudgeSfx, playWinSfx } from "../audio/sfx";
import type { BoardCell } from "../game/engine/board";
import { analyzeMoveHints, type MoveHint } from "../game/engine/moveHints";
import { createWinLinesIndex } from "../game/engine/winLines";
import {
  DEFAULT_LAYER_HOTKEYS,
  resolveLayerHotkeyAction,
  sanitizeLayerHotkeys,
  shouldBlockGlobalSpaceHotkey,
  type LayerHotkeys
} from "../game/interaction/hotkey";
import { detectLayoutMode, type LayoutMode } from "../game/interaction/deviceMode";
import {
  DEFAULT_QUALITY_LEVEL,
  getQualityProfile,
  selectQualityLevel,
  type QualityLevel,
  type QualityMode
} from "../game/interaction/qualityProfile";
import {
  clampQualityLevelByCap,
  evaluateRenderBootstrap
} from "../game/interaction/renderBootstrap";
import {
  ADAPTIVE_TICK_FAST_MS,
  evaluateAdaptiveTick,
  type AdaptiveTickIntervalMs
} from "../game/interaction/adaptiveTick";
import {
  evaluateVfxStage,
  evaluateVfxStageTransition,
  type BoardSceneVfxStage
} from "../game/interaction/vfxStage";
import {
  readRenderCapabilityProfile,
  resolveInitialRenderPreset,
  resolveRenderCapabilityStorage,
  resolveRenderDeviceKey,
  updateRenderCapabilityProfile
} from "../game/interaction/renderCapabilityProfile";
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
  resolveCueAfterTick,
  type InteractionCue
} from "../game/interaction/interactionCue";
import { createPrimaryIntentState } from "../game/interaction/primaryIntent";
import { evaluateHudSpotlight } from "../game/interaction/hudSpotlight";
import { evaluateLayerQuickNav } from "../game/interaction/layerQuickNav";
import {
  createWinLineDirectorRoundKey,
  evaluateWinLineDirector
} from "../game/interaction/winLineDirector";
import {
  classifyBoardLoadError,
  evaluateBoardLoadRecovery,
  type BoardLoadErrorKind
} from "../game/interaction/boardLoadRecovery";
import { shouldAllowAdaptiveRenderTuning } from "../game/interaction/foregroundAdaptation";
import { BoardLoadingPanel } from "../ui/BoardLoadingPanel";
import { createLazyBoardScene } from "../ui/boardSceneLoader";
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

class BoardSceneSlotErrorBoundary extends Component<
  {
    resetKey: number;
    onError: (error: unknown) => void;
    children: ReactNode;
  },
  { hasError: boolean }
> {
  constructor(props: {
    resetKey: number;
    onError: (error: unknown) => void;
    children: ReactNode;
  }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  componentDidUpdate(prevProps: { resetKey: number }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

function BoardSceneMountMarker({
  onReady,
  children
}: {
  onReady: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    onReady();
  }, [onReady]);

  return <>{children}</>;
}

const WIN_LINE_CINEMATIC_DURATION_MS = 2200;
const LAYER_NAV_INPUT_THROTTLE_MS = 170;
const CALM_MODE_ENTER_FPS = 33;
const CALM_MODE_EXIT_FPS = 48;
const RENDER_PROFILE_LEARN_WINDOW_MS = 10_000;
const RENDER_PROFILE_SAMPLE_INTERVAL_MS = 2_500;
const RENDER_PROFILE_LOW_FPS_SAMPLE_FPS = 40;
const EMPTY_HINT_MOVES: MoveHint[] = [];
const LAYER_HOTKEY_STORAGE_KEY = "nebula-cube-layer-hotkeys-v1";

function readLayerHotkeysFromStorage(): LayerHotkeys {
  if (typeof localStorage === "undefined") {
    return DEFAULT_LAYER_HOTKEYS;
  }
  const raw = localStorage.getItem(LAYER_HOTKEY_STORAGE_KEY);
  if (!raw) {
    return DEFAULT_LAYER_HOTKEYS;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<LayerHotkeys>;
    return sanitizeLayerHotkeys(parsed);
  } catch {
    return DEFAULT_LAYER_HOTKEYS;
  }
}

function persistLayerHotkeysToStorage(hotkeys: LayerHotkeys): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(LAYER_HOTKEY_STORAGE_KEY, JSON.stringify(hotkeys));
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
  const winLineDirectorTriggeredRoundKeyRef = useRef<string | null>(null);
  const winLineDirectorTimerRef = useRef<number | null>(null);
  const boardAutoRetryTimerRef = useRef<number | null>(null);
  const wasForegroundActiveRef = useRef(
    (typeof document === "undefined" ? true : document.visibilityState === "visible") &&
      (typeof document === "undefined" ? true : document.hasFocus())
  );
  const focusGuardTriggeredTurnKeyRef = useRef<string | null>(null);
  const focusGuardWasMyTurnRef = useRef(snapshot.turn === myMark && snapshot.winner === null);
  const layerNavLastInputAtMsRef = useRef(0);
  const layerNavLastRotateAtMsRef = useRef(0);
  const turnNudgeTriggeredTurnKeyRef = useRef<string | null>(null);
  const turnNudgeTitleActiveRef = useRef(false);
  const wasMyTurnRef = useRef(snapshot.turn === myMark && snapshot.winner === null);
  const baseDocumentTitleRef = useRef(
    typeof document === "undefined" ? "NEBULA CUBE" : document.title
  );
  const [renderCapabilityEnv] = useState(() => ({
    storage: resolveRenderCapabilityStorage(),
    deviceKey: resolveRenderDeviceKey()
  }));
  const [initialRenderPreset] = useState(() => {
    const profile = readRenderCapabilityProfile({
      storage: renderCapabilityEnv.storage,
      nowMs: Date.now(),
      deviceKey: renderCapabilityEnv.deviceKey
    });
    return resolveInitialRenderPreset({
      qualityMode,
      fallbackQualityLevel: initialQualityLevelFromMode(qualityMode),
      fallbackVfxStage: "basic",
      profile
    });
  });
  const renderCapabilityLastPersistAtMsRef = useRef(0);
  const renderCapabilitySampledRoomIdRef = useRef<string | null>(null);
  const renderCapabilityForegroundLearnedMsRef = useRef(0);
  const renderCapabilityForegroundStartedAtMsRef = useRef<number | null>(null);
  const renderCapabilityConsecutiveLowFpsTrustedSamplesRef = useRef(0);
  const [boardSceneReloadToken, setBoardSceneReloadToken] = useState(0);
  const [boardSceneReady, setBoardSceneReady] = useState(false);
  const [boardSceneLoadFailed, setBoardSceneLoadFailed] = useState(false);
  const [boardLoadErrorKind, setBoardLoadErrorKind] = useState<BoardLoadErrorKind>("transient");
  const [boardAutoRetryAttempt, setBoardAutoRetryAttempt] = useState(0);
  const [boardAutoRetryScheduledAtMs, setBoardAutoRetryScheduledAtMs] = useState<number | null>(null);
  const [boardAutoRetrying, setBoardAutoRetrying] = useState(false);
  const LazyBoardScene = useMemo(() => createLazyBoardScene(), [boardSceneReloadToken]);
  const [assistEnabled, setAssistEnabled] = useState(false);
  const [onboardingProgress, setOnboardingProgress] = useState(() =>
    createDefaultOnboardingProgress()
  );
  const [focusMode, setFocusMode] = useState<"auto" | "manual">("manual");
  const [focusLayer, setFocusLayer] = useState(Math.floor(snapshot.size / 2));
  const [nonFocusLayerOpacity, setNonFocusLayerOpacity] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [layerHotkeys, setLayerHotkeys] = useState<LayerHotkeys>(() => readLayerHotkeysFromStorage());
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    if (typeof window === "undefined") {
      return "desktop";
    }
    return detectLayoutMode(window);
  });
  const [qualityLevel, setQualityLevel] = useState<QualityLevel>(
    () => initialRenderPreset.initialQualityLevel
  );
  const [autoCalmMode, setAutoCalmMode] = useState(false);
  const [qualityLastSwitchAtMs, setQualityLastSwitchAtMs] = useState<number>(0);
  const [roomEnteredAtMs, setRoomEnteredAtMs] = useState<number>(() => Date.now());
  const [averageFps, setAverageFps] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [tickIntervalMs, setTickIntervalMs] = useState<AdaptiveTickIntervalMs>(ADAPTIVE_TICK_FAST_MS);
  const tickIntervalStartedAtMsRef = useRef<number>(Date.now());
  const tickIntervalSwitchCountRef = useRef(0);
  const [pageVisible, setPageVisible] = useState<boolean>(() =>
    typeof document === "undefined" ? true : document.visibilityState === "visible"
  );
  const [windowFocused, setWindowFocused] = useState<boolean>(() =>
    typeof document === "undefined" ? true : document.hasFocus()
  );
  const [foregroundReturnedAtMs, setForegroundReturnedAtMs] = useState<number | null>(null);
  const [turnNudgeNotificationPermission, setTurnNudgeNotificationPermission] =
    useState<TurnNudgeNotificationPermission>(() => resolveTurnNudgeNotificationPermission());
  const [turnNudgePermissionRequestPending, setTurnNudgePermissionRequestPending] = useState(false);
  const [turnNudgePermissionLastRequestedAtMs, setTurnNudgePermissionLastRequestedAtMs] = useState<
    number | null
  >(null);
  const [winLineCinematicActive, setWinLineCinematicActive] = useState(false);
  const [activeInteractionCue, setActiveInteractionCue] = useState<InteractionCue | null>(null);
  const [settlementStartedAtMs, setSettlementStartedAtMs] = useState<number | null>(null);
  const [autoRematchCountdownStartedAtMs, setAutoRematchCountdownStartedAtMs] = useState<number | null>(
    null
  );
  const [autoContinueCountdownStartedAtMs, setAutoContinueCountdownStartedAtMs] = useState<
    number | null
  >(null);
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
  const boardLoadRecoveryDecision = useMemo(
    () =>
      evaluateBoardLoadRecovery({
        failedAutoRetryCount: boardAutoRetryAttempt,
        isOnline: connectionStatus === "online",
        errorKind: boardLoadErrorKind
      }),
    [boardAutoRetryAttempt, boardLoadErrorKind, connectionStatus]
  );
  const boardAutoRetryRemainingMs = useMemo(() => {
    if (boardAutoRetryScheduledAtMs === null) {
      return null;
    }
    return Math.max(0, boardAutoRetryScheduledAtMs - nowMs);
  }, [boardAutoRetryScheduledAtMs, nowMs]);
  const adaptiveRenderTuningDecision = useMemo(
    () =>
      shouldAllowAdaptiveRenderTuning({
        pageVisible,
        windowFocused,
        returnedToForegroundAtMs: foregroundReturnedAtMs,
        nowMs,
        averageFps
      }),
    [averageFps, foregroundReturnedAtMs, nowMs, pageVisible, windowFocused]
  );
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
  const hintMovesForBoard = assistEnabled && canPlace ? hintResult.recommendedMoves : EMPTY_HINT_MOVES;
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
  const canObserveBoard = boardSceneReady && !boardSceneLoadFailed;
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
        canObserveBoard,
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
      canObserveBoard,
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
  const primaryIntent = useMemo(
    () =>
      createPrimaryIntentState({
        smartAction
      }),
    [smartAction]
  );
  const effectivePrimaryIntent = useMemo(() => {
    if (snapshot.winner) {
      return primaryIntent;
    }
    const boardActionReady = canObserveBoard;
    if (boardActionReady) {
      return primaryIntent;
    }

    const boardStatusReason = boardSceneLoadFailed
      ? boardLoadRecoveryDecision.status === "refresh-required"
        ? "棋盘资源已更新，请点击“立即刷新并恢复战局”"
        : "棋盘加载失败，可点击“重试加载棋盘”后继续操作"
      : "棋盘加载中，战场就绪后可操作";

    return {
      ...primaryIntent,
      enabled: false,
      reason: boardStatusReason
    };
  }, [
    boardLoadRecoveryDecision.status,
    canObserveBoard,
    primaryIntent,
    snapshot.winner
  ]);
  const onboardingGuide = useMemo(
    () =>
      createOnboardingGuideState({
        enabled: shouldShowOnboarding,
        canUsePrimaryAction: effectivePrimaryIntent.enabled,
        progress: onboardingProgress
      }),
    [effectivePrimaryIntent.enabled, onboardingProgress, shouldShowOnboarding]
  );
  const renderBootstrapDecision = useMemo(
    () =>
      evaluateRenderBootstrap({
        elapsedMs: nowMs - roomEnteredAtMs,
        averageFps,
        qualityMode
      }),
    [averageFps, nowMs, qualityMode, roomEnteredAtMs]
  );
  const baseEffectiveQualityLevel: QualityLevel = autoCalmMode ? "low" : qualityLevel;
  const effectiveQualityLevel: QualityLevel =
    qualityMode === "auto"
      ? clampQualityLevelByCap(baseEffectiveQualityLevel, renderBootstrapDecision.qualityCap)
      : baseEffectiveQualityLevel;
  const qualityProfile = useMemo(
    () => getQualityProfile(effectiveQualityLevel),
    [effectiveQualityLevel]
  );
  const evaluatedVfxStage = useMemo(
    () =>
      evaluateVfxStage({
        renderBootstrapPhase: renderBootstrapDecision.phase,
        averageFps,
        qualityLevel: effectiveQualityLevel,
        sparklesEnabled: qualityProfile.sparklesEnabled
      }),
    [averageFps, effectiveQualityLevel, qualityProfile.sparklesEnabled, renderBootstrapDecision.phase]
  );
  const targetVfxStage = useMemo(() => {
    if (
      qualityMode === "auto" &&
      renderBootstrapDecision.phase !== "boot" &&
      (averageFps === null || !Number.isFinite(averageFps))
    ) {
      return initialRenderPreset.initialVfxStage;
    }
    return evaluatedVfxStage;
  }, [
    averageFps,
    evaluatedVfxStage,
    initialRenderPreset.initialVfxStage,
    qualityMode,
    renderBootstrapDecision.phase
  ]);
  const [vfxStage, setVfxStage] = useState<BoardSceneVfxStage>(targetVfxStage);
  const [vfxStageStartedAtMs, setVfxStageStartedAtMs] = useState<number>(() => nowMs);
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
  const timeoutAssistInThresholdWindow =
    timeoutAssistEnabled &&
    boardSceneReady &&
    !boardSceneLoadFailed &&
    !assistEnabled &&
    canPlace &&
    turnRemainingMs !== null &&
    turnRemainingMs <= timeoutAssistThresholdMs;
  const timeoutAssistFallbackTarget = useMemo(() => {
    if (!timeoutAssistInThresholdWindow) {
      return null;
    }
    const emergencyHints = analyzeMoveHints(
      boardCells,
      myMark,
      snapshot.size,
      snapshot.connect,
      1,
      hintsWinLinesIndex
    );
    return (
      emergencyHints.winningMoves[0]?.coordinate ??
      emergencyHints.blockingMoves[0]?.coordinate ??
      emergencyHints.recommendedMoves[0]?.coordinate ??
      null
    );
  }, [
    boardCells,
    hintsWinLinesIndex,
    myMark,
    snapshot.connect,
    snapshot.size,
    timeoutAssistInThresholdWindow
  ]);
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
        canPlace: canPlace && boardSceneReady && !boardSceneLoadFailed,
        hasPendingMove,
        smartAction: effectivePrimaryIntent,
        fallbackTarget: timeoutAssistFallbackTarget,
        alreadyTriggeredThisTurn: timeoutAssistAlreadyTriggered,
        thresholdMs: timeoutAssistThresholdMs
      }),
    [
      timeoutAssistAlreadyTriggered,
      timeoutAssistFallbackTarget,
      timeoutAssistEnabled,
      turnRemainingMs,
      canPlace,
      boardSceneReady,
      boardSceneLoadFailed,
      hasPendingMove,
      effectivePrimaryIntent,
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
  const adaptiveTickDecision = useMemo(
    () =>
      evaluateAdaptiveTick({
        nowMs,
        renderBootstrapPhase: renderBootstrapDecision.phase,
        turnRemainingMs,
        opponentReconnectRemainingMs,
        timeoutAssistThresholdMs,
        currentIntervalMs: tickIntervalMs,
        currentIntervalStartedAtMs: tickIntervalStartedAtMsRef.current
      }),
    [
      nowMs,
      renderBootstrapDecision.phase,
      turnRemainingMs,
      opponentReconnectRemainingMs,
      timeoutAssistThresholdMs,
      tickIntervalMs
    ]
  );
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
  const handleLayerSwipe = useCallback(
    (deltaY: number) => {
      if (settingsOpen || !Number.isFinite(deltaY) || deltaY === 0) {
        return;
      }
      const now = Date.now();
      if (now - layerNavLastInputAtMsRef.current < LAYER_NAV_INPUT_THROTTLE_MS) {
        return;
      }
      handleLayerStep(deltaY > 0 ? 1 : -1);
    },
    [handleLayerStep, settingsOpen]
  );

  const clearBoardAutoRetryTimer = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (boardAutoRetryTimerRef.current !== null) {
      window.clearTimeout(boardAutoRetryTimerRef.current);
      boardAutoRetryTimerRef.current = null;
    }
    setBoardAutoRetryScheduledAtMs(null);
  }, []);
  const triggerBoardSceneReload = useCallback(() => {
    setBoardSceneReloadToken((current) => current + 1);
    setBoardSceneReady(false);
    setBoardSceneLoadFailed(false);
  }, []);
  const handleRetryBoardSceneLoad = useCallback(() => {
    clearBoardAutoRetryTimer();
    setBoardAutoRetrying(false);
    setBoardAutoRetryAttempt(0);
    setBoardLoadErrorKind("transient");
    triggerBoardSceneReload();
  }, [clearBoardAutoRetryTimer, triggerBoardSceneReload]);
  const handleBoardSceneLoadError = useCallback((error: unknown) => {
    setBoardLoadErrorKind(classifyBoardLoadError(error));
    setBoardSceneLoadFailed(true);
    setBoardSceneReady(false);
  }, []);
  const handleRefreshAndResume = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.location.reload();
  }, []);
  const handleBoardSceneReady = useCallback(() => {
    clearBoardAutoRetryTimer();
    setBoardAutoRetrying(false);
    setBoardAutoRetryAttempt(0);
    setBoardLoadErrorKind("transient");
    setBoardSceneReady(true);
    setBoardSceneLoadFailed(false);
  }, [clearBoardAutoRetryTimer]);
  useEffect(() => {
    if (!boardSceneLoadFailed) {
      clearBoardAutoRetryTimer();
      setBoardAutoRetrying(false);
      return;
    }
    if (!boardLoadRecoveryDecision.shouldAutoRetry || boardLoadRecoveryDecision.nextRetryDelayMs === null) {
      clearBoardAutoRetryTimer();
      setBoardAutoRetrying(false);
      return;
    }
    if (typeof window === "undefined" || boardAutoRetryTimerRef.current !== null) {
      return;
    }

    setBoardAutoRetrying(true);
    setBoardAutoRetryScheduledAtMs(Date.now() + boardLoadRecoveryDecision.nextRetryDelayMs);
    boardAutoRetryTimerRef.current = window.setTimeout(() => {
      boardAutoRetryTimerRef.current = null;
      setBoardAutoRetryScheduledAtMs(null);
      setBoardAutoRetrying(false);
      setBoardAutoRetryAttempt((current) => current + 1);
      triggerBoardSceneReload();
    }, boardLoadRecoveryDecision.nextRetryDelayMs);
  }, [
    boardLoadRecoveryDecision.nextRetryDelayMs,
    boardLoadRecoveryDecision.shouldAutoRetry,
    boardSceneLoadFailed,
    clearBoardAutoRetryTimer,
    triggerBoardSceneReload
  ]);
  const handlePrimaryAction = useCallback(() => {
    if (!effectivePrimaryIntent.enabled) {
      return;
    }
    if (effectivePrimaryIntent.actionType === "enableAssist") {
      setAssistEnabled(true);
      return;
    }
    if (effectivePrimaryIntent.actionType === "continueMatch") {
      handleContinueMatchAction();
      return;
    }
    if (
      effectivePrimaryIntent.actionType === "rematch" ||
      effectivePrimaryIntent.actionType === "opponentReady"
    ) {
      handleRematchAction();
      return;
    }
    if (
      effectivePrimaryIntent.actionType === "win" ||
      effectivePrimaryIntent.actionType === "block" ||
      effectivePrimaryIntent.actionType === "suggest"
    ) {
      stopWinLineCinematic();
      if (!effectivePrimaryIntent.target) {
        return;
      }
      onPlace(effectivePrimaryIntent.target);
    }
  }, [
    effectivePrimaryIntent,
    handleContinueMatchAction,
    handleRematchAction,
    onPlace,
    stopWinLineCinematic
  ]);

  const handleAssistToggle = useCallback(() => {
    setAssistEnabled((current) => !current);
  }, []);
  const handleNonFocusLayerOpacityChange = useCallback((nextOpacity: number) => {
    setNonFocusLayerOpacity(clampOpacity(nextOpacity));
  }, []);

  const handleOpenSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  const handleLayerHotkeyChange = useCallback((kind: "up" | "down", key: string) => {
    setLayerHotkeys((current) =>
      sanitizeLayerHotkeys({
        ...current,
        [kind]: key
      })
    );
  }, []);

  const handleResetLayerHotkeys = useCallback(() => {
    setLayerHotkeys(DEFAULT_LAYER_HOTKEYS);
  }, []);

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
  useEffect(() => () => clearBoardAutoRetryTimer(), [clearBoardAutoRetryTimer]);
  useEffect(() => {
    persistLayerHotkeysToStorage(layerHotkeys);
  }, [layerHotkeys]);

  useEffect(() => {
    setFocusMode("manual");
    setFocusLayer(Math.floor(snapshot.size / 2));
    setSettingsOpen(false);
    setActiveInteractionCue(null);
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
    turnNudgeTriggeredTurnKeyRef.current = null;
    wasMyTurnRef.current = snapshot.turn === myMark && snapshot.winner === null;
    focusGuardWasMyTurnRef.current = snapshot.turn === myMark && snapshot.winner === null;
    clearTurnNudgeTitle();
    stopWinLineCinematic();
    layerNavLastInputAtMsRef.current = 0;
    layerNavLastRotateAtMsRef.current = 0;
    setSettlementStartedAtMs(null);
    setAutoRematchCountdownStartedAtMs(null);
    setAutoContinueCountdownStartedAtMs(null);
    setAutoCalmMode(false);
    setRoomEnteredAtMs(Date.now());
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
    if (timeoutAssistDecision.nextAction !== "autoAct") {
      return;
    }
    if (timeoutAssistTurnKeyRef.current === timeoutAssistTurnKey) {
      return;
    }
    timeoutAssistTurnKeyRef.current = timeoutAssistTurnKey;

    if (timeoutAssistDecision.autoActSource === "fallbackTarget") {
      if (!timeoutAssistFallbackTarget) {
        return;
      }
      stopWinLineCinematic();
      onPlace(timeoutAssistFallbackTarget);
      return;
    }

    handlePrimaryAction();
  }, [
    handlePrimaryAction,
    onPlace,
    stopWinLineCinematic,
    timeoutAssistDecision.autoActSource,
    timeoutAssistDecision.nextAction,
    timeoutAssistFallbackTarget,
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
    const foregroundActive = pageVisible && windowFocused;
    if (foregroundActive && !wasForegroundActiveRef.current) {
      setForegroundReturnedAtMs(Date.now());
    }
    if (!foregroundActive && foregroundReturnedAtMs !== null) {
      setForegroundReturnedAtMs(null);
    }
    wasForegroundActiveRef.current = foregroundActive;
  }, [foregroundReturnedAtMs, pageVisible, windowFocused]);

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
    setSettingsOpen(false);
  }, [layoutMode]);

  useEffect(() => {
    if (!activeInteractionCue) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    const nowMs = Date.now();
    const activeCue = resolveCueAfterTick(activeInteractionCue, nowMs);
    if (!activeCue) {
      setActiveInteractionCue(null);
      return;
    }
    const timer = window.setTimeout(() => {
      setActiveInteractionCue((current) => resolveCueAfterTick(current, Date.now()));
    }, Math.max(0, activeCue.expiresAtMs - nowMs));
    return () => window.clearTimeout(timer);
  }, [activeInteractionCue]);

  useEffect(() => {
    if (!errorMessage || !activeInteractionCue) {
      return;
    }
    // Keep clearing while error is visible so hidden interaction cues cannot rebound later.
    setActiveInteractionCue(null);
  }, [activeInteractionCue, errorMessage]);

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
    const syncNowMs = () => {
      setNowMs(Date.now());
    };
    syncNowMs();
    const timer = window.setInterval(syncNowMs, tickIntervalMs);
    return () => window.clearInterval(timer);
  }, [tickIntervalMs]);

  useEffect(() => {
    if (!adaptiveTickDecision.switched || adaptiveTickDecision.intervalMs === tickIntervalMs) {
      return;
    }
    tickIntervalStartedAtMsRef.current = nowMs;
    setTickIntervalMs(adaptiveTickDecision.intervalMs);
    if (import.meta.env.DEV) {
      tickIntervalSwitchCountRef.current += 1;
      console.debug(
        `[adaptiveTick] switch #${tickIntervalSwitchCountRef.current}: ${tickIntervalMs}ms -> ${adaptiveTickDecision.intervalMs}ms (${adaptiveTickDecision.reason})`
      );
    }
  }, [adaptiveTickDecision, nowMs, tickIntervalMs]);

  useEffect(() => {
    clearBoardAutoRetryTimer();
    setBoardAutoRetrying(false);
    setBoardAutoRetryAttempt(0);
    setBoardLoadErrorKind("transient");
    setForegroundReturnedAtMs(null);
    wasForegroundActiveRef.current =
      (typeof document === "undefined" ? true : document.visibilityState === "visible") &&
      (typeof document === "undefined" ? true : document.hasFocus());
    setBoardSceneReady(false);
    setBoardSceneLoadFailed(false);
  }, [clearBoardAutoRetryTimer, snapshot.roomId]);

  useEffect(() => {
    const transition = evaluateVfxStageTransition({
      currentStage: vfxStage,
      targetStage: targetVfxStage,
      stageStartedAtMs: vfxStageStartedAtMs,
      nowMs,
      averageFps
    });
    if (!adaptiveRenderTuningDecision.allow) {
      return;
    }
    if (!transition.switched || transition.nextStage === vfxStage) {
      return;
    }
    if (import.meta.env.DEV) {
      const fpsLabel =
        averageFps !== null && Number.isFinite(averageFps) ? averageFps.toFixed(1) : "n/a";
      console.debug(
        `[vfxStage] ${vfxStage} -> ${transition.nextStage} (${transition.reason}, target=${targetVfxStage}, fps=${fpsLabel})`
      );
    }
    setVfxStage(transition.nextStage);
    setVfxStageStartedAtMs(nowMs);
  }, [
    adaptiveRenderTuningDecision.allow,
    averageFps,
    nowMs,
    targetVfxStage,
    vfxStage,
    vfxStageStartedAtMs
  ]);

  useEffect(() => {
    if (renderCapabilitySampledRoomIdRef.current === snapshot.roomId) {
      return;
    }
    renderCapabilitySampledRoomIdRef.current = snapshot.roomId;
    renderCapabilityLastPersistAtMsRef.current = 0;
    renderCapabilityForegroundLearnedMsRef.current = 0;
    renderCapabilityForegroundStartedAtMsRef.current =
      pageVisible && windowFocused ? nowMs : null;
    renderCapabilityConsecutiveLowFpsTrustedSamplesRef.current = 0;
  }, [nowMs, pageVisible, snapshot.roomId, windowFocused]);

  useEffect(() => {
    const trustedForeground = pageVisible && windowFocused;
    if (trustedForeground) {
      if (renderCapabilityForegroundStartedAtMsRef.current === null) {
        renderCapabilityForegroundStartedAtMsRef.current = nowMs;
      }
      return;
    }
    if (renderCapabilityForegroundStartedAtMsRef.current === null) {
      return;
    }
    renderCapabilityForegroundLearnedMsRef.current += Math.max(
      0,
      nowMs - renderCapabilityForegroundStartedAtMsRef.current
    );
    renderCapabilityForegroundStartedAtMsRef.current = null;
  }, [nowMs, pageVisible, windowFocused]);

  useEffect(() => {
    if (qualityMode !== "auto" || renderBootstrapDecision.phase === "boot") {
      renderCapabilityConsecutiveLowFpsTrustedSamplesRef.current = 0;
      return;
    }
    const sampleTrusted = pageVisible && windowFocused;
    if (!sampleTrusted) {
      renderCapabilityConsecutiveLowFpsTrustedSamplesRef.current = 0;
      return;
    }
    if (averageFps === null || !Number.isFinite(averageFps)) {
      return;
    }
    const foregroundElapsedMs =
      renderCapabilityForegroundLearnedMsRef.current +
      (renderCapabilityForegroundStartedAtMsRef.current !== null
        ? Math.max(0, nowMs - renderCapabilityForegroundStartedAtMsRef.current)
        : 0);
    if (foregroundElapsedMs > RENDER_PROFILE_LEARN_WINDOW_MS) {
      return;
    }
    if (nowMs - renderCapabilityLastPersistAtMsRef.current < RENDER_PROFILE_SAMPLE_INTERVAL_MS) {
      return;
    }
    if (autoCalmMode || averageFps < RENDER_PROFILE_LOW_FPS_SAMPLE_FPS) {
      renderCapabilityConsecutiveLowFpsTrustedSamplesRef.current += 1;
    } else {
      renderCapabilityConsecutiveLowFpsTrustedSamplesRef.current = 0;
    }

    const profile = updateRenderCapabilityProfile({
      storage: renderCapabilityEnv.storage,
      nowMs,
      deviceKey: renderCapabilityEnv.deviceKey,
      averageFps,
      autoCalmMode,
      qualityLevel: effectiveQualityLevel,
      vfxStage,
      sampleTrusted,
      consecutiveLowFpsTrustedSamples:
        renderCapabilityConsecutiveLowFpsTrustedSamplesRef.current
    });
    renderCapabilityLastPersistAtMsRef.current = nowMs;

    if (import.meta.env.DEV && profile) {
      console.debug(
        `[renderProfile] quality=${profile.recommendedInitialQualityLevel}, vfx=${profile.recommendedInitialVfxStage}, confidence=${profile.confidence.toFixed(2)}, samples=${profile.sampleCount}, trustedMs=${Math.round(foregroundElapsedMs)}`
      );
    }
  }, [
    autoCalmMode,
    averageFps,
    effectiveQualityLevel,
    nowMs,
    pageVisible,
    qualityMode,
    renderBootstrapDecision.phase,
    windowFocused,
    vfxStage,
    renderCapabilityEnv
  ]);

  useEffect(() => {
    const nowMs = Date.now();
    if (qualityMode === "auto") {
      if (renderBootstrapDecision.phase === "boot") {
        return;
      }
      if (!adaptiveRenderTuningDecision.allow) {
        return;
      }
    }

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
  }, [
    adaptiveRenderTuningDecision.allow,
    averageFps,
    qualityLastSwitchAtMs,
    qualityLevel,
    qualityMode,
    renderBootstrapDecision.phase
  ]);

  useEffect(() => {
    if (qualityMode !== "auto") {
      if (autoCalmMode) {
        setAutoCalmMode(false);
      }
      return;
    }
    if (renderBootstrapDecision.phase === "boot") {
      if (autoCalmMode) {
        setAutoCalmMode(false);
      }
      return;
    }
    if (!adaptiveRenderTuningDecision.allow) {
      return;
    }
    if (averageFps === null || !Number.isFinite(averageFps)) {
      return;
    }
    if (!autoCalmMode && averageFps < CALM_MODE_ENTER_FPS) {
      setAutoCalmMode(true);
      return;
    }
    if (autoCalmMode && averageFps > CALM_MODE_EXIT_FPS) {
      setAutoCalmMode(false);
    }
  }, [
    adaptiveRenderTuningDecision.allow,
    autoCalmMode,
    averageFps,
    qualityMode,
    renderBootstrapDecision.phase
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (shouldBlockGlobalSpaceHotkey(event.target)) {
        return;
      }

      if (!event.repeat) {
        const layerAction = resolveLayerHotkeyAction(event.key, layerHotkeys);
        if (layerAction === -1 && layerQuickNav.canGoPrev) {
          event.preventDefault();
          handleLayerStep(-1);
          return;
        }
        if (layerAction === 1 && layerQuickNav.canGoNext) {
          event.preventDefault();
          handleLayerStep(1);
          return;
        }
      }

      if (layoutMode === "mobile") {
        return;
      }
      if (event.code !== "Space" || event.repeat) {
        return;
      }
      if (!effectivePrimaryIntent.enabled) {
        return;
      }
      event.preventDefault();
      handlePrimaryAction();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    effectivePrimaryIntent.enabled,
    handleLayerStep,
    handlePrimaryAction,
    layerHotkeys,
    layerQuickNav.canGoNext,
    layerQuickNav.canGoPrev,
    layoutMode
  ]);

  const gameToastType = errorMessage ? "error" : activeInteractionCue?.tone ?? null;
  const gameToastMessage = errorMessage ?? activeInteractionCue?.message ?? null;

  return (
    <main className={`game-page ${layoutMode === "mobile" ? "mobile" : "desktop"}`}>
      <div
        className="board-slot"
        onPointerDownCapture={(event) => {
          if (!settingsOpen) {
            return;
          }
          event.stopPropagation();
          handleCloseSettings();
        }}
      >
        {boardSceneLoadFailed ? (
          <BoardLoadingPanel
            state="failed"
            onRetry={handleRetryBoardSceneLoad}
            onRefresh={handleRefreshAndResume}
            autoRetrying={boardAutoRetrying}
            autoRetryNextAttempt={boardLoadRecoveryDecision.nextAttempt}
            autoRetryAttemptedCount={boardAutoRetryAttempt}
            autoRetryMaxAttempts={boardLoadRecoveryDecision.maxAutoRetryCount}
            autoRetryRemainingMs={boardAutoRetryRemainingMs}
            recoveryStatus={boardLoadRecoveryDecision.status}
          />
        ) : (
          <BoardSceneSlotErrorBoundary
            resetKey={boardSceneReloadToken}
            onError={handleBoardSceneLoadError}
          >
            <Suspense fallback={<BoardLoadingPanel state="loading" />}>
              <BoardSceneMountMarker
                key={`board-scene-${snapshot.roomId}-${boardSceneReloadToken}`}
                onReady={handleBoardSceneReady}
              >
                <LazyBoardScene
                  layoutMode={layoutMode}
                  board={snapshot.board}
                  size={snapshot.size}
                  canPlace={canPlace}
                  vfxStage={vfxStage}
                  ambientEnabled={renderBootstrapDecision.ambientEnabled}
                  nonFocusLayerOpacity={nonFocusLayerOpacity}
                  qualityProfile={qualityProfile}
                  opponentMoveCue={opponentMoveCue}
                  winningLine={snapshot.winningLine}
                  winLineCinematicActive={winLineCinematicActive}
                  focusLayer={focusLayer}
                  hintMoves={hintMovesForBoard}
                  pendingMove={pendingMove}
                  onPlace={onPlace}
                  onLayerSwipe={handleLayerSwipe}
                  onUserRotate={handleBoardRotate}
                />
              </BoardSceneMountMarker>
            </Suspense>
          </BoardSceneSlotErrorBoundary>
        )}
      </div>
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
        primaryAction={effectivePrimaryIntent}
        onboardingGuide={onboardingGuide.visible ? onboardingGuide : null}
        settingsOpen={settingsOpen}
        layerHotkeys={layerHotkeys}
        qualityMode={qualityMode}
        qualityLevel={effectiveQualityLevel}
        calmModeActive={autoCalmMode}
        renderBootstrapPhase={renderBootstrapDecision.phase}
        averageFps={averageFps}
        myConnected={snapshot.players[myMark].connected}
        opponentConnected={opponentConnected}
        turnRemainingMs={turnRemainingMs}
        turnUrgent={turnUrgent}
        timeoutAssistEnabled={timeoutAssistEnabled}
        timeoutAssistUrgency={timeoutAssistDecision.urgencyLabel}
        timeoutAssistAutoActSource={timeoutAssistDecision.autoActSource}
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
        canObserveBoard={canObserveBoard}
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
        onOpenSettings={handleOpenSettings}
        onCloseSettings={handleCloseSettings}
        onLayerStep={handleLayerStep}
        onLayerHotkeyChange={handleLayerHotkeyChange}
        onResetLayerHotkeys={handleResetLayerHotkeys}
        onToggleAssist={handleAssistToggle}
        onNonFocusLayerOpacityChange={handleNonFocusLayerOpacityChange}
        onQualityModeChange={onQualityModeChange}
        onRematch={handleRematchAction}
        onLeave={onLeave}
      />
      {gameToastMessage ? (
        <div
          className={`game-toast ${
            gameToastType === "focus-cue"
              ? "focus-cue"
              : gameToastType === "focus-guard-cue"
                ? "focus-guard-cue"
                : "error"
          }`}
        >
          {gameToastMessage}
        </div>
      ) : null}
    </main>
  );
}
