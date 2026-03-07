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
import { createSmartActionState } from "../game/interaction/smartAction";
import { BoardScene } from "../ui/BoardScene";
import { HUD } from "../ui/HUD";

interface GameRoomPageProps {
  snapshot: RoomSnapshot;
  myMark: PlayerMark;
  connectionStatus: "connecting" | "online" | "reconnecting" | "offline";
  qualityMode: QualityMode;
  onQualityModeChange: (mode: QualityMode) => void;
  pendingMove: {
    coordinate: Coordinate3D;
    player: PlayerMark;
  } | null;
  errorMessage: string | null;
  onPlace: (coordinate: Coordinate3D) => void;
  onRematch: () => void;
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
  qualityMode,
  onQualityModeChange,
  pendingMove,
  errorMessage,
  onPlace,
  onRematch,
  onLeave
}: GameRoomPageProps) {
  const lastMoveNumberRef = useRef(0);
  const winnerRef = useRef(snapshot.winner);
  const [assistEnabled, setAssistEnabled] = useState(true);
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
  const hasPendingMove = pendingMove !== null;
  const canPlace =
    snapshot.turn === myMark && !snapshot.winner && connectionStatus === "online" && !hasPendingMove;
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
        hasPendingMove
      }),
    [
      assistEnabled,
      connectionStatus,
      hasPendingMove,
      hintMovesForBoard,
      myMark,
      snapshot.turn,
      snapshot.winner
    ]
  );
  const qualityProfile = useMemo(() => getQualityProfile(qualityLevel), [qualityLevel]);

  const handlePrimaryAction = useCallback(() => {
    if (!smartAction.enabled) {
      return;
    }
    if (smartAction.actionType === "rematch") {
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
  }, [onPlace, onRematch, smartAction]);

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
        advancedOpen={advancedOpen}
        qualityMode={qualityMode}
        qualityLevel={qualityLevel}
        averageFps={averageFps}
        myConnected={snapshot.players[myMark].connected}
        opponentConnected={snapshot.players[myMark === "X" ? "O" : "X"].connected}
        connectionStatus={connectionStatus}
        onPrimaryAction={handlePrimaryAction}
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
