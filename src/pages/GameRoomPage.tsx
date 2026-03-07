import { useEffect, useMemo, useRef, useState } from "react";
import type { Coordinate3D, PlayerMark, RoomSnapshot } from "../network/protocol";
import { playDropSfx, playWinSfx } from "../audio/sfx";
import type { BoardCell } from "../game/engine/board";
import { analyzeMoveHints, type MoveHint } from "../game/engine/moveHints";
import { createWinLinesIndex } from "../game/engine/winLines";
import { BoardScene } from "../ui/BoardScene";
import { HUD } from "../ui/HUD";

interface GameRoomPageProps {
  snapshot: RoomSnapshot;
  myMark: PlayerMark;
  connectionStatus: "connecting" | "online" | "reconnecting" | "offline";
  errorMessage: string | null;
  onPlace: (coordinate: Coordinate3D) => void;
  onRematch: () => void;
  onLeave: () => void;
}

function clampLayer(layer: number, size: number): number {
  return Math.max(0, Math.min(size - 1, layer));
}

function quickActionLabel(hint: MoveHint | null): string {
  if (!hint) {
    return "一键建议";
  }
  if (hint.priority === "win") {
    return "一键制胜";
  }
  if (hint.priority === "block") {
    return "一键防守";
  }
  return "一键建议";
}

export function GameRoomPage({
  snapshot,
  myMark,
  connectionStatus,
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
  const canPlace = snapshot.turn === myMark && !snapshot.winner && connectionStatus === "online";
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
  const autoFocusLayer = useMemo(() => {
    if (primaryHint) {
      return primaryHint.coordinate.z;
    }
    if (snapshot.lastMove) {
      return snapshot.lastMove.z;
    }
    return Math.floor(snapshot.size / 2);
  }, [primaryHint, snapshot.lastMove, snapshot.size]);

  const guidanceText = useMemo(() => {
    if (!assistEnabled) {
      return "战术辅助已关闭，可手动自由对局";
    }
    if (!canPlace) {
      if (snapshot.winner) {
        return "对局结束，可点击再来一局";
      }
      return "等待对手落子，建议会自动刷新";
    }
    if (hintResult.winningMoves.length > 0) {
      return "检测到一步制胜点，建议立即终结对局";
    }
    if (hintResult.blockingMoves.length > 0) {
      return "检测到必须防守点，建议优先封堵";
    }
    if (primaryHint) {
      return "建议点已高亮，可直接一键落子";
    }
    return "暂无强制点，保持连线延展";
  }, [assistEnabled, canPlace, hintResult.blockingMoves.length, hintResult.winningMoves.length, primaryHint, snapshot.winner]);

  const handleQuickPlace = () => {
    if (!canPlace || !assistEnabled || !primaryHint) {
      return;
    }
    onPlace(primaryHint.coordinate);
  };

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
  }, [snapshot.roomId, snapshot.size]);

  useEffect(() => {
    if (focusMode !== "auto") {
      return;
    }
    setFocusLayer(clampLayer(autoFocusLayer, snapshot.size));
  }, [autoFocusLayer, focusMode, snapshot.size]);

  return (
    <main className="game-page">
      <BoardScene
        board={snapshot.board}
        size={snapshot.size}
        canPlace={canPlace}
        lastMove={snapshot.lastMove}
        winningLine={snapshot.winningLine}
        focusLayer={focusLayer}
        hintMoves={assistEnabled ? hintResult.recommendedMoves : []}
        onPlace={onPlace}
      />
      <HUD
        roomId={snapshot.roomId}
        boardSize={snapshot.size}
        myMark={myMark}
        turn={snapshot.turn}
        winner={snapshot.winner}
        assistEnabled={assistEnabled}
        focusLayer={focusLayer}
        focusMode={focusMode}
        guidanceText={guidanceText}
        quickActionLabel={quickActionLabel(primaryHint)}
        canQuickPlace={Boolean(assistEnabled && canPlace && primaryHint)}
        myConnected={snapshot.players[myMark].connected}
        opponentConnected={snapshot.players[myMark === "X" ? "O" : "X"].connected}
        connectionStatus={connectionStatus}
        onQuickPlace={handleQuickPlace}
        onLayerStep={handleLayerStep}
        onAutoFocus={handleAutoFocus}
        onToggleAssist={handleAssistToggle}
        onRematch={onRematch}
        onLeave={onLeave}
      />
      {errorMessage ? <div className="game-toast">{errorMessage}</div> : null}
    </main>
  );
}
