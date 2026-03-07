import { useEffect, useMemo, useRef, useState } from "react";
import { MatchPage } from "./pages/MatchPage";
import { GameRoomPage } from "./pages/GameRoomPage";
import { createSocketClient } from "./network/socketClient";
import {
  isPendingMoveStale,
  PENDING_MOVE_STALE_TIMEOUT_MS,
  shouldClearPendingMove,
  type PendingMoveState
} from "./game/interaction/pendingMove";
import {
  DEFAULT_QUALITY_MODE,
  type QualityMode
} from "./game/interaction/qualityProfile";
import { validateContinueMatchRequest } from "./game/interaction/continueMatch";
import type {
  Coordinate3D,
  MoveAckPayload,
  PlayerMark,
  RoomSnapshot
} from "./network/protocol";

type ConnectionState = "connecting" | "online" | "reconnecting" | "offline";

interface RoomSession {
  roomId: string;
  seatToken: string;
  mark: PlayerMark;
}

const SESSION_STORAGE_KEY = "nebula-cube-session";
const QUALITY_MODE_STORAGE_KEY = "nebula-cube-quality-mode";

function createClientMoveId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `move_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function readSessionFromStorage(): RoomSession | null {
  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as RoomSession;
    if (!parsed.roomId || !parsed.seatToken || !parsed.mark) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function readQualityModeFromStorage(): QualityMode {
  const raw = localStorage.getItem(QUALITY_MODE_STORAGE_KEY);
  if (raw === "auto" || raw === "quality" || raw === "smooth") {
    return raw;
  }
  return DEFAULT_QUALITY_MODE;
}

function persistSession(session: RoomSession | null) {
  if (!session) {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function persistQualityMode(mode: QualityMode): void {
  localStorage.setItem(QUALITY_MODE_STORAGE_KEY, mode);
}

export default function App() {
  const socket = useMemo(() => createSocketClient(), []);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [session, setSession] = useState<RoomSession | null>(() => readSessionFromStorage());
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [isMatching, setIsMatching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMoveState | null>(null);
  const [qualityMode, setQualityMode] = useState<QualityMode>(() => readQualityModeFromStorage());

  const sessionRef = useRef<RoomSession | null>(session);

  useEffect(() => {
    sessionRef.current = session;
    persistSession(session);
  }, [session]);

  useEffect(() => {
    persistQualityMode(qualityMode);
  }, [qualityMode]);

  useEffect(() => {
    const handleConnect = () => {
      setConnectionState("online");
      const currentSession = sessionRef.current;
      if (currentSession) {
        socket.emit("room:resume", {
          roomId: currentSession.roomId,
          seatToken: currentSession.seatToken
        });
      }
    };

    const handleDisconnect = () => {
      setConnectionState("reconnecting");
      setPendingMove(null);
    };

    const handleConnectionError = () => {
      setConnectionState("offline");
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectionError);

    socket.on("queue:joined", ({ waitingForOpponent }) => {
      setIsMatching(waitingForOpponent);
      setErrorMessage(null);
    });

    socket.on("queue:matched", ({ roomId, mark, seatToken, snapshot: nextSnapshot }) => {
      setSession({ roomId, mark, seatToken });
      setSnapshot(nextSnapshot);
      setIsMatching(false);
      setErrorMessage(null);
      setPendingMove(null);
    });

    socket.on("room:resumed", ({ roomId, mark, seatToken, snapshot: nextSnapshot }) => {
      setSession({ roomId, mark, seatToken });
      setSnapshot(nextSnapshot);
      setIsMatching(false);
      setErrorMessage(null);
      setPendingMove(null);
    });

    socket.on("room:update", ({ snapshot: nextSnapshot }) => {
      setSnapshot(nextSnapshot);
      setIsMatching(false);
      setPendingMove((currentPendingMove) => {
        if (!currentPendingMove) {
          return null;
        }
        if (shouldClearPendingMove(nextSnapshot, currentPendingMove)) {
          return null;
        }
        return currentPendingMove;
      });
    });

    socket.on("room:resume-failed", ({ reason }) => {
      setSession(null);
      setSnapshot(null);
      setIsMatching(false);
      setErrorMessage(reason);
      setPendingMove(null);
    });

    socket.on("game:move:ack", ({ clientMoveId, accepted, reason, roomMoveNumber }: MoveAckPayload) => {
      setPendingMove((currentPendingMove) => {
        if (!currentPendingMove || currentPendingMove.clientMoveId !== clientMoveId) {
          return currentPendingMove;
        }

        if (!accepted) {
          setErrorMessage(reason ?? "落子失败");
          return null;
        }

        return {
          ...currentPendingMove,
          status: "accepted",
          roomMoveNumber
        };
      });
    });

    socket.on("game:error", ({ message }) => {
      setIsMatching(false);
      setErrorMessage(message);
      setPendingMove(null);
    });

    socket.connect();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [socket]);

  useEffect(() => {
    if (!errorMessage) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setErrorMessage(null);
    }, 2800);
    return () => window.clearTimeout(timeout);
  }, [errorMessage]);

  useEffect(() => {
    if (!pendingMove) {
      return;
    }
    if (pendingMove.status !== "pending") {
      return;
    }

    const elapsed = Date.now() - pendingMove.submittedAt;
    const remaining = Math.max(0, PENDING_MOVE_STALE_TIMEOUT_MS - elapsed);
    const timeout = window.setTimeout(() => {
      setPendingMove((currentPendingMove) => {
        if (!currentPendingMove || currentPendingMove.clientMoveId !== pendingMove.clientMoveId) {
          return currentPendingMove;
        }
        if (!isPendingMoveStale(currentPendingMove)) {
          return currentPendingMove;
        }

        const currentSession = sessionRef.current;
        if (socket.connected && currentSession) {
          socket.emit("room:state:request", {
            roomId: currentSession.roomId,
            seatToken: currentSession.seatToken
          });
        }
        setErrorMessage("网络波动，正在同步棋盘状态，请重试落子");
        return null;
      });
    }, remaining);

    return () => window.clearTimeout(timeout);
  }, [pendingMove, socket]);

  const startMatch = () => {
    if (!socket.connected) {
      setErrorMessage("正在连接服务器，请稍后重试");
      return;
    }
    setIsMatching(true);
    setErrorMessage(null);
    socket.emit("queue:join", {});
  };

  const placePiece = (coordinate: Coordinate3D) => {
    if (!session || !snapshot) {
      return;
    }
    if (snapshot.winner) {
      return;
    }
    if (pendingMove) {
      return;
    }

    const boardIndex =
      coordinate.x + coordinate.y * snapshot.size + coordinate.z * snapshot.size * snapshot.size;
    if (snapshot.board[boardIndex] !== 0) {
      return;
    }

    const clientMoveId = createClientMoveId();
    setPendingMove({
      clientMoveId,
      coordinate,
      player: session.mark,
      status: "pending",
      submittedAt: Date.now()
    });
    socket.emit("game:place", {
      roomId: session.roomId,
      seatToken: session.seatToken,
      clientMoveId,
      x: coordinate.x,
      y: coordinate.y,
      z: coordinate.z
    });
  };

  const requestRematch = () => {
    if (!session) {
      return;
    }
    socket.emit("game:rematch", {
      roomId: session.roomId,
      seatToken: session.seatToken
    });
  };

  const requestContinueMatch = () => {
    const validation = validateContinueMatchRequest({
      hasSession: session !== null,
      hasSnapshot: snapshot !== null,
      isConnected: socket.connected
    });

    if (!validation.ok) {
      if (validation.reason === "offline") {
        setErrorMessage("正在连接服务器，请稍后重试");
      }
      return;
    }

    if (!session || !snapshot) {
      return;
    }

    setPendingMove(null);
    setErrorMessage(null);
    setSession(null);
    setSnapshot(null);
    setIsMatching(true);
    sessionRef.current = null;
    persistSession(null);

    socket.emit("queue:continue", {
      roomId: session.roomId,
      seatToken: session.seatToken
    });
  };

  const leaveRoom = () => {
    sessionRef.current = null;
    persistSession(null);
    setSession(null);
    setSnapshot(null);
    setIsMatching(false);
    setErrorMessage(null);
    setPendingMove(null);
    socket.disconnect();
    socket.connect();
  };

  if (!session || !snapshot) {
    return (
      <MatchPage
        connectionStatus={connectionState}
        isMatching={isMatching}
        onStartMatch={startMatch}
      />
    );
  }

  return (
    <GameRoomPage
      snapshot={snapshot}
      myMark={session.mark}
      connectionStatus={connectionState}
      qualityMode={qualityMode}
      onQualityModeChange={setQualityMode}
      pendingMove={
        pendingMove
          ? {
              coordinate: pendingMove.coordinate,
              player: pendingMove.player
            }
          : null
      }
      errorMessage={errorMessage}
      onPlace={placePiece}
      onRematch={requestRematch}
      onContinueMatch={requestContinueMatch}
      onLeave={leaveRoom}
    />
  );
}
