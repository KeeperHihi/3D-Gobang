import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { MatchPage } from "./pages/MatchPage";
import { createSocketClient } from "./network/socketClient";
import { LoadingStage } from "./ui/LoadingStage";
import {
  isPendingMoveStale,
  PENDING_MOVE_STALE_TIMEOUT_MS,
  reconcilePendingMove,
  type PendingMoveState
} from "./game/interaction/pendingMove";
import {
  DEFAULT_QUALITY_MODE,
  type QualityMode
} from "./game/interaction/qualityProfile";
import { validateContinueMatchRequest } from "./game/interaction/continueMatch";
import { type SceneWarmupStatus } from "./game/interaction/sceneWarmup";
import {
  createInitialNetworkLatencyProfile,
  deriveTimeoutAssistThresholdMs,
  updateLatencySamples
} from "./game/interaction/networkLatency";
import type {
  Coordinate3D,
  MoveAckPayload,
  PlayerMark,
  RoomSnapshot
} from "./network/protocol";

type ConnectionState = "connecting" | "online" | "reconnecting" | "offline";
type MatchPhase = "idle" | "queuing" | "matched";
type RoomEntryMode = "fresh" | "resumed";

interface RoomSession {
  roomId: string;
  seatToken: string;
  mark: PlayerMark;
}

const SESSION_STORAGE_KEY = "nebula-cube-session";
const QUALITY_MODE_STORAGE_KEY = "nebula-cube-quality-mode";
const ONBOARDING_STORAGE_KEY = "nebula-cube-onboarding-v1";
const TIMEOUT_ASSIST_STORAGE_KEY = "nebula-cube-timeout-assist-v1";

function loadGameRoomPageModule() {
  return import("./pages/GameRoomPage");
}

const LazyGameRoomPage = lazy(() =>
  loadGameRoomPageModule().then((module) => ({
    default: module.GameRoomPage
  }))
);

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

function readOnboardingCompletedFromStorage(): boolean {
  return localStorage.getItem(ONBOARDING_STORAGE_KEY) === "done";
}

function persistOnboardingCompleted(completed: boolean): void {
  if (!completed) {
    return;
  }
  localStorage.setItem(ONBOARDING_STORAGE_KEY, "done");
}

function readTimeoutAssistFromStorage(): boolean {
  const raw = localStorage.getItem(TIMEOUT_ASSIST_STORAGE_KEY);
  if (raw === "off") {
    return false;
  }
  return true;
}

function persistTimeoutAssistToStorage(enabled: boolean): void {
  localStorage.setItem(TIMEOUT_ASSIST_STORAGE_KEY, enabled ? "on" : "off");
}

export default function App() {
  const socket = useMemo(() => createSocketClient(), []);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [session, setSession] = useState<RoomSession | null>(() => readSessionFromStorage());
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [matchPhase, setMatchPhase] = useState<MatchPhase>(() => (session ? "matched" : "idle"));
  const [queueSize, setQueueSize] = useState(0);
  const [queueStartedAtMs, setQueueStartedAtMs] = useState<number | null>(null);
  const [queueElapsedSeconds, setQueueElapsedSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMoveState | null>(null);
  const [qualityMode, setQualityMode] = useState<QualityMode>(() => readQualityModeFromStorage());
  const [roomEntryMode, setRoomEntryMode] = useState<RoomEntryMode>(() =>
    session ? "resumed" : "fresh"
  );
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean>(() =>
    readOnboardingCompletedFromStorage()
  );
  const [timeoutAssistEnabled, setTimeoutAssistEnabled] = useState<boolean>(() =>
    readTimeoutAssistFromStorage()
  );
  const [networkLatencyProfile, setNetworkLatencyProfile] = useState(() =>
    createInitialNetworkLatencyProfile()
  );
  const [sceneWarmupStatus, setSceneWarmupStatus] = useState<SceneWarmupStatus>("idle");

  const sessionRef = useRef<RoomSession | null>(session);
  const matchPhaseRef = useRef<MatchPhase>(matchPhase);
  const sceneWarmupStartedRef = useRef(false);
  const pendingMoveSubmittedAtRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    sessionRef.current = session;
    persistSession(session);
  }, [session]);

  useEffect(() => {
    matchPhaseRef.current = matchPhase;
  }, [matchPhase]);

  useEffect(() => {
    persistQualityMode(qualityMode);
  }, [qualityMode]);

  useEffect(() => {
    persistOnboardingCompleted(onboardingCompleted);
  }, [onboardingCompleted]);

  useEffect(() => {
    persistTimeoutAssistToStorage(timeoutAssistEnabled);
  }, [timeoutAssistEnabled]);

  useEffect(() => {
    if (matchPhase !== "queuing" || queueStartedAtMs === null) {
      setQueueElapsedSeconds(0);
      return;
    }

    const updateElapsed = () => {
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - queueStartedAtMs) / 1000));
      setQueueElapsedSeconds(elapsedSeconds);
    };

    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [matchPhase, queueStartedAtMs]);

  useEffect(() => {
    if (matchPhase !== "queuing" || sceneWarmupStartedRef.current) {
      return;
    }

    sceneWarmupStartedRef.current = true;
    setSceneWarmupStatus("warming");
    void loadGameRoomPageModule()
      .then(() => {
        setSceneWarmupStatus("ready");
      })
      .catch(() => {
        sceneWarmupStartedRef.current = false;
        setSceneWarmupStatus("failed");
      });
  }, [matchPhase]);

  useEffect(() => {
    const resetQueueState = () => {
      setQueueStartedAtMs(null);
      setQueueElapsedSeconds(0);
      setQueueSize(0);
    };

    const handleConnect = () => {
      setConnectionState("online");
      const currentSession = sessionRef.current;
      if (currentSession) {
        socket.emit("room:resume", {
          roomId: currentSession.roomId,
          seatToken: currentSession.seatToken
        });
        return;
      }

      if (matchPhaseRef.current === "queuing") {
        setMatchPhase("idle");
        resetQueueState();
        setErrorMessage("连接已恢复，请重新开始匹配");
      }
    };

    const handleDisconnect = () => {
      setConnectionState("reconnecting");
      setPendingMove(null);
      pendingMoveSubmittedAtRef.current.clear();
      if (!sessionRef.current) {
        setMatchPhase("idle");
        resetQueueState();
      }
    };

    const handleConnectionError = () => {
      setConnectionState("offline");
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectionError);

    socket.on("queue:joined", ({ waitingForOpponent, queueSize: nextQueueSize }) => {
      if (waitingForOpponent) {
        setMatchPhase("queuing");
        setQueueSize(nextQueueSize);
        setQueueStartedAtMs((current) => current ?? Date.now());
      } else {
        setMatchPhase("idle");
        setQueueSize(nextQueueSize);
        setQueueStartedAtMs(null);
        setQueueElapsedSeconds(0);
      }
      setErrorMessage(null);
    });

    socket.on("queue:left", ({ queueSize: nextQueueSize }) => {
      setMatchPhase("idle");
      setQueueSize(nextQueueSize);
      setQueueStartedAtMs(null);
      setQueueElapsedSeconds(0);
      setErrorMessage(null);
    });

    socket.on("queue:matched", ({ roomId, mark, seatToken, snapshot: nextSnapshot }) => {
      setSession({ roomId, mark, seatToken });
      setSnapshot(nextSnapshot);
      setMatchPhase("matched");
      setRoomEntryMode("fresh");
      resetQueueState();
      setErrorMessage(null);
      setPendingMove(null);
      pendingMoveSubmittedAtRef.current.clear();
    });

    socket.on("room:resumed", ({ roomId, mark, seatToken, snapshot: nextSnapshot }) => {
      setSession({ roomId, mark, seatToken });
      setSnapshot(nextSnapshot);
      setMatchPhase("matched");
      setRoomEntryMode("resumed");
      resetQueueState();
      setErrorMessage(null);
      setPendingMove(null);
      pendingMoveSubmittedAtRef.current.clear();
    });

    socket.on("room:update", ({ snapshot: nextSnapshot }) => {
      setSnapshot(nextSnapshot);
      setMatchPhase("matched");
      resetQueueState();
      setPendingMove((currentPendingMove) => {
        const reconciled = reconcilePendingMove(nextSnapshot, currentPendingMove);
        if (reconciled.shouldDropTracking && currentPendingMove) {
          pendingMoveSubmittedAtRef.current.delete(currentPendingMove.clientMoveId);
        }
        return reconciled.pendingMove;
      });
    });

    socket.on("room:resume-failed", ({ reason }) => {
      setSession(null);
      setSnapshot(null);
      setMatchPhase("idle");
      setRoomEntryMode("fresh");
      resetQueueState();
      setErrorMessage(reason);
      setPendingMove(null);
      pendingMoveSubmittedAtRef.current.clear();
    });

    socket.on("game:move:ack", ({ clientMoveId, accepted, reason, roomMoveNumber }: MoveAckPayload) => {
      const submittedAt = pendingMoveSubmittedAtRef.current.get(clientMoveId);
      if (submittedAt !== undefined) {
        pendingMoveSubmittedAtRef.current.delete(clientMoveId);
        const roundTripMs = Date.now() - submittedAt;
        setNetworkLatencyProfile((current) => updateLatencySamples(current, roundTripMs));
      }

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
      if (matchPhaseRef.current === "queuing") {
        setMatchPhase("idle");
        resetQueueState();
      }
      setErrorMessage(message);
      setPendingMove(null);
      pendingMoveSubmittedAtRef.current.clear();
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
        pendingMoveSubmittedAtRef.current.delete(pendingMove.clientMoveId);
        setErrorMessage("网络波动，正在同步棋盘状态，请重试落子");
        return null;
      });
    }, remaining);

    return () => window.clearTimeout(timeout);
  }, [pendingMove, socket]);

  const startMatch = () => {
    if (sessionRef.current && !snapshot) {
      setErrorMessage("正在恢复对局，请稍后");
      return;
    }
    if (!socket.connected) {
      setErrorMessage("正在连接服务器，请稍后重试");
      return;
    }
    setMatchPhase("queuing");
    setQueueSize((current) => (current > 0 ? current : 1));
    setQueueStartedAtMs(Date.now());
    setQueueElapsedSeconds(0);
    setErrorMessage(null);
    socket.emit("queue:join", {});
  };

  const cancelMatch = () => {
    if (!socket.connected) {
      setErrorMessage("正在连接服务器，请稍后重试");
      return;
    }
    if (matchPhaseRef.current !== "queuing") {
      return;
    }
    socket.emit("queue:leave", {});
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
    const submittedAt = Date.now();
    pendingMoveSubmittedAtRef.current.set(clientMoveId, submittedAt);
    setPendingMove({
      clientMoveId,
      coordinate,
      player: session.mark,
      status: "pending",
      submittedAt
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
    setMatchPhase("queuing");
    setQueueSize(1);
    setQueueStartedAtMs(Date.now());
    setQueueElapsedSeconds(0);
    sessionRef.current = null;
    persistSession(null);
    pendingMoveSubmittedAtRef.current.clear();

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
    setMatchPhase("idle");
    setRoomEntryMode("fresh");
    setQueueSize(0);
    setQueueStartedAtMs(null);
    setQueueElapsedSeconds(0);
    setErrorMessage(null);
    setPendingMove(null);
    pendingMoveSubmittedAtRef.current.clear();
    socket.disconnect();
    socket.connect();
  };

  if (!session || !snapshot) {
    const isRecoveringSession = session !== null && snapshot === null;
    return (
      <MatchPage
        connectionStatus={connectionState}
        matchPhase={matchPhase === "queuing" ? "queuing" : "idle"}
        queueSize={queueSize}
        queueElapsedSeconds={queueElapsedSeconds}
        sceneWarmupStatus={sceneWarmupStatus}
        isRecoveringSession={isRecoveringSession}
        onStartMatch={startMatch}
        onCancelMatch={cancelMatch}
      />
    );
  }

  const shouldShowOnboarding =
    !onboardingCompleted &&
    roomEntryMode === "fresh" &&
    !snapshot.winner &&
    snapshot.board.every((cell) => cell === 0);
  const timeoutAssistThresholdMs = deriveTimeoutAssistThresholdMs(networkLatencyProfile);

  return (
    <Suspense
      fallback={
        <LoadingStage
          title="正在部署星云战场"
          detail="3D 场景加载中，马上进入对局..."
        />
      }
    >
      <LazyGameRoomPage
        snapshot={snapshot}
        myMark={session.mark}
        connectionStatus={connectionState}
        shouldShowOnboarding={shouldShowOnboarding}
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
        onCompleteOnboarding={() => setOnboardingCompleted(true)}
        timeoutAssistEnabled={timeoutAssistEnabled}
        onTimeoutAssistEnabledChange={setTimeoutAssistEnabled}
        timeoutAssistThresholdMs={timeoutAssistThresholdMs}
        timeoutAssistNetworkTier={networkLatencyProfile.networkTier}
        onLeave={leaveRoom}
      />
    </Suspense>
  );
}
