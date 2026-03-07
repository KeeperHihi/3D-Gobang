import { useEffect, useMemo, useRef, useState } from "react";
import { MatchPage } from "./pages/MatchPage";
import { GameRoomPage } from "./pages/GameRoomPage";
import { createSocketClient } from "./network/socketClient";
import type { Coordinate3D, PlayerMark, RoomSnapshot } from "./network/protocol";

type ConnectionState = "connecting" | "online" | "reconnecting" | "offline";

interface RoomSession {
  roomId: string;
  seatToken: string;
  mark: PlayerMark;
}

const SESSION_STORAGE_KEY = "nebula-cube-session";

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

function persistSession(session: RoomSession | null) {
  if (!session) {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export default function App() {
  const socket = useMemo(() => createSocketClient(), []);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [session, setSession] = useState<RoomSession | null>(() => readSessionFromStorage());
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [isMatching, setIsMatching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sessionRef = useRef<RoomSession | null>(session);

  useEffect(() => {
    sessionRef.current = session;
    persistSession(session);
  }, [session]);

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
    });

    socket.on("room:resumed", ({ roomId, mark, seatToken, snapshot: nextSnapshot }) => {
      setSession({ roomId, mark, seatToken });
      setSnapshot(nextSnapshot);
      setIsMatching(false);
      setErrorMessage(null);
    });

    socket.on("room:update", ({ snapshot: nextSnapshot }) => {
      setSnapshot(nextSnapshot);
      setIsMatching(false);
    });

    socket.on("room:resume-failed", ({ reason }) => {
      setSession(null);
      setSnapshot(null);
      setIsMatching(false);
      setErrorMessage(reason);
    });

    socket.on("game:error", ({ message }) => {
      setErrorMessage(message);
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
    socket.emit("game:place", {
      roomId: session.roomId,
      seatToken: session.seatToken,
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

  const leaveRoom = () => {
    sessionRef.current = null;
    persistSession(null);
    setSession(null);
    setSnapshot(null);
    setIsMatching(false);
    setErrorMessage(null);
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
      errorMessage={errorMessage}
      onPlace={placePiece}
      onRematch={requestRematch}
      onLeave={leaveRoom}
    />
  );
}
