import { useEffect, useRef } from "react";
import type { Coordinate3D, PlayerMark, RoomSnapshot } from "../network/protocol";
import { playDropSfx, playWinSfx } from "../audio/sfx";
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
  const canPlace = snapshot.turn === myMark && !snapshot.winner && connectionStatus === "online";

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

  return (
    <main className="game-page">
      <BoardScene
        board={snapshot.board}
        size={snapshot.size}
        canPlace={canPlace}
        lastMove={snapshot.lastMove}
        winningLine={snapshot.winningLine}
        onPlace={onPlace}
      />
      <HUD
        roomId={snapshot.roomId}
        myMark={myMark}
        turn={snapshot.turn}
        winner={snapshot.winner}
        myConnected={snapshot.players[myMark].connected}
        opponentConnected={snapshot.players[myMark === "X" ? "O" : "X"].connected}
        connectionStatus={connectionStatus}
        onRematch={onRematch}
        onLeave={onLeave}
      />
      {errorMessage ? <div className="game-toast">{errorMessage}</div> : null}
    </main>
  );
}
