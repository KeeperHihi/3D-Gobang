import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import { Server, type Socket } from "socket.io";
import { Matchmaker, type MatchEnqueueOptions } from "./matchmaker";
import type {
  BotLevel,
  ClientToServerEvents,
  ChallengeResolvedOutcome,
  LobbyPresenceStatus,
  PlayerMark,
  QueueMode,
  RoomChatMessage,
  ServerToClientEvents
} from "../../shared/network/protocol";
import { chooseBestBotMove } from "./bot/engine";
import {
  applyDisconnectForfeitIfExpired,
  applyMoveToRoom,
  applyTurnForfeitIfExpired,
  cancelRematch,
  clearReconnectDeadline,
  createRoomState,
  getRecordedMoveAck,
  markForSocket,
  recordMoveAck,
  requestRematch,
  requestSurrender,
  clearTurnDeadline,
  setPlayerConnection,
  startReconnectDeadline,
  snapshotFromRoomState,
  type RoomState
} from "./roomState";

const app = express();
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";
const port = Number(process.env.PORT ?? 3001);

app.use(
  cors({
    origin: frontendOrigin,
    credentials: true
  })
);

app.get("/health", (_, response) => {
  response.json({
    ok: true,
    now: Date.now()
  });
});

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: frontendOrigin,
    credentials: true
  },
  transports: ["websocket"]
});

const matchmaker = new Matchmaker();
const rooms = new Map<string, RoomState>();
const seatTokenMap = new Map<string, { roomId: string; mark: PlayerMark }>();
const spectatorTokenMap = new Map<string, { roomId: string; socketId: string }>();
const spectatorSocketMap = new Map<string, { roomId: string; spectatorToken: string }>();
const socketRoomMap = new Map<string, string>();
const reconnectForfeitTimers = new Map<string, NodeJS.Timeout>();
const turnForfeitTimers = new Map<string, NodeJS.Timeout>();
const continueAvoidRetryTimers = new Map<string, NodeJS.Timeout>();
const botMoveTimers = new Map<string, NodeJS.Timeout>();
const RECONNECT_GRACE_PERIOD_MS = 30_000;
const CONTINUE_AVOID_OPPONENT_MS = 20_000;
const CHALLENGE_TIMEOUT_MS = 30_000;
const BOT_THINK_DELAY_MS = 220;
const DISPLAY_NAME_MAX_LENGTH = 16;
const ROOM_CHAT_MAX_HISTORY = 60;
const ROOM_CHAT_MAX_MESSAGE_LENGTH = 220;
const ROOM_CHAT_RATE_LIMIT_WINDOW_MS = 2_500;
const ROOM_CHAT_RATE_LIMIT_MAX_MESSAGES = 8;

interface LobbyProfile {
  displayName: string;
  status: "idle" | "queuing" | "in-game";
}

interface ChallengeState {
  challengeId: string;
  fromSocketId: string;
  toSocketId: string;
  expiresAt: number;
  timeout: NodeJS.Timeout;
}

type ChatSenderIdentity =
  | {
      room: RoomState;
      senderRole: "player";
      senderMark: PlayerMark;
    }
  | {
      room: RoomState;
      senderRole: "spectator";
      senderMark: null;
    };

const lobbyProfiles = new Map<string, LobbyProfile>();
const challenges = new Map<string, ChallengeState>();
const challengeBySocket = new Map<string, string>();
const roomChatHistoryMap = new Map<string, RoomChatMessage[]>();
const roomChatRateLimitMap = new Map<string, { windowStartedAt: number; sentCount: number }>();

function fallbackDisplayName(socketId: string): string {
  return `玩家-${socketId.slice(0, 4)}`;
}

function normalizeDisplayName(rawName: string | undefined, fallback: string): string {
  const trimmed = (rawName ?? "").trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed.slice(0, DISPLAY_NAME_MAX_LENGTH);
}

function ensureLobbyProfile(socketId: string): LobbyProfile {
  const existing = lobbyProfiles.get(socketId);
  if (existing) {
    return existing;
  }
  const profile: LobbyProfile = {
    displayName: fallbackDisplayName(socketId),
    status: "idle"
  };
  lobbyProfiles.set(socketId, profile);
  return profile;
}

function setLobbyStatus(socketId: string, status: LobbyProfile["status"]): void {
  const profile = ensureLobbyProfile(socketId);
  profile.status = status;
}

function resolveLobbyPresenceStatus(socketId: string): LobbyPresenceStatus {
  const profile = ensureLobbyProfile(socketId);
  if (challengeBySocket.has(socketId) && profile.status === "idle") {
    return "challenge";
  }
  return profile.status;
}

function emitLobbyPresenceToSocket(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>
): void {
  const players = Array.from(io.sockets.sockets.keys())
    .map((socketId) => {
      const profile = ensureLobbyProfile(socketId);
      return {
        socketId,
        displayName: profile.displayName,
        status: resolveLobbyPresenceStatus(socketId),
        isSelf: socketId === socket.id
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "zh-Hans-CN"));

  socket.emit("lobby:presence", {
    selfSocketId: socket.id,
    players
  });
}

function broadcastLobbyPresence(): void {
  io.sockets.sockets.forEach((connectedSocket) => {
    emitLobbyPresenceToSocket(connectedSocket);
  });
}

function normalizeChatMessage(rawMessage: string | undefined): string {
  const normalized = (rawMessage ?? "").replace(/\r/g, "").trim();
  if (!normalized) {
    return "";
  }
  return normalized.slice(0, ROOM_CHAT_MAX_MESSAGE_LENGTH);
}

function canSendRoomChat(socketId: string, nowMs: number): boolean {
  const currentWindow = roomChatRateLimitMap.get(socketId);
  if (!currentWindow || nowMs - currentWindow.windowStartedAt >= ROOM_CHAT_RATE_LIMIT_WINDOW_MS) {
    roomChatRateLimitMap.set(socketId, {
      windowStartedAt: nowMs,
      sentCount: 1
    });
    return true;
  }

  if (currentWindow.sentCount >= ROOM_CHAT_RATE_LIMIT_MAX_MESSAGES) {
    return false;
  }
  currentWindow.sentCount += 1;
  return true;
}

function appendRoomChatMessage(roomId: string, message: RoomChatMessage): void {
  const current = roomChatHistoryMap.get(roomId) ?? [];
  const next = [...current, message];
  if (next.length > ROOM_CHAT_MAX_HISTORY) {
    roomChatHistoryMap.set(roomId, next.slice(next.length - ROOM_CHAT_MAX_HISTORY));
    return;
  }
  roomChatHistoryMap.set(roomId, next);
}

function emitRoomChatHistoryToSocket(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  roomId: string
): void {
  const messages = roomChatHistoryMap.get(roomId) ?? [];
  socket.emit("room:chat:history", {
    roomId,
    messages
  });
}

function emitSpectateJoinFailed(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  reason: string
): void {
  socket.emit("room:spectate:join-failed", {
    reason
  });
}

function clearSpectatorSessionBySocket(socketId: string): void {
  const session = spectatorSocketMap.get(socketId);
  if (!session) {
    return;
  }
  spectatorSocketMap.delete(socketId);
  const tokenRecord = spectatorTokenMap.get(session.spectatorToken);
  if (tokenRecord && tokenRecord.socketId === socketId) {
    spectatorTokenMap.delete(session.spectatorToken);
  }
  socketRoomMap.delete(socketId);
}

function clearSpectatorSessionByToken(spectatorToken: string): void {
  const tokenRecord = spectatorTokenMap.get(spectatorToken);
  if (!tokenRecord) {
    return;
  }
  spectatorTokenMap.delete(spectatorToken);
  const socketRecord = spectatorSocketMap.get(tokenRecord.socketId);
  if (socketRecord && socketRecord.spectatorToken === spectatorToken) {
    spectatorSocketMap.delete(tokenRecord.socketId);
    socketRoomMap.delete(tokenRecord.socketId);
  }
}

function bindSpectatorTokenToSocket(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  roomId: string,
  spectatorToken: string
): boolean {
  const tokenRecord = spectatorTokenMap.get(spectatorToken);
  if (!tokenRecord || tokenRecord.roomId !== roomId) {
    return false;
  }

  const previousSocketId = tokenRecord.socketId;
  if (previousSocketId !== socket.id) {
    const previousSocketRecord = spectatorSocketMap.get(previousSocketId);
    if (previousSocketRecord && previousSocketRecord.spectatorToken === spectatorToken) {
      spectatorSocketMap.delete(previousSocketId);
      socketRoomMap.delete(previousSocketId);
    }

    const previousSocket = io.sockets.sockets.get(previousSocketId);
    if (previousSocket) {
      previousSocket.disconnect(true);
    }
  }

  spectatorTokenMap.set(spectatorToken, {
    roomId,
    socketId: socket.id
  });
  spectatorSocketMap.set(socket.id, {
    roomId,
    spectatorToken
  });
  attachSocketToRoom(socket, roomId);
  setLobbyStatus(socket.id, "in-game");
  return true;
}

function resolveRoomBySpectatorToken(roomId: string, spectatorToken: string): RoomState | null {
  const tokenRecord = spectatorTokenMap.get(spectatorToken);
  if (!tokenRecord || tokenRecord.roomId !== roomId) {
    return null;
  }
  const room = rooms.get(roomId);
  if (!room) {
    clearSpectatorSessionByToken(spectatorToken);
    return null;
  }
  return room;
}

function clearSpectatorsForRoom(roomId: string): void {
  const tokensToClear: string[] = [];
  let clearedAny = false;
  spectatorTokenMap.forEach((tokenRecord, spectatorToken) => {
    if (tokenRecord.roomId === roomId) {
      tokensToClear.push(spectatorToken);
    }
  });

  for (const spectatorToken of tokensToClear) {
    const tokenRecord = spectatorTokenMap.get(spectatorToken);
    if (!tokenRecord) {
      continue;
    }
    clearedAny = true;
    const spectatorSocket = io.sockets.sockets.get(tokenRecord.socketId);
    clearSpectatorSessionByToken(spectatorToken);
    if (!spectatorSocket) {
      continue;
    }
    spectatorSocket.leave(roomId);
    setLobbyStatus(spectatorSocket.id, "idle");
    emitGameError(spectatorSocket, "对局已结束，观战已退出");
  }
  if (clearedAny) {
    broadcastLobbyPresence();
  }
}

function resolveChallenge(
  challengeId: string,
  outcome: ChallengeResolvedOutcome,
  message: string
): ChallengeState | null {
  const challenge = challenges.get(challengeId);
  if (!challenge) {
    return null;
  }

  clearTimeout(challenge.timeout);
  challenges.delete(challengeId);
  if (challengeBySocket.get(challenge.fromSocketId) === challengeId) {
    challengeBySocket.delete(challenge.fromSocketId);
  }
  if (challengeBySocket.get(challenge.toSocketId) === challengeId) {
    challengeBySocket.delete(challenge.toSocketId);
  }

  const payload = {
    challengeId,
    outcome,
    message
  };
  const senderSocket = io.sockets.sockets.get(challenge.fromSocketId);
  const receiverSocket = io.sockets.sockets.get(challenge.toSocketId);
  senderSocket?.emit("challenge:resolved", payload);
  if (receiverSocket && receiverSocket.id !== senderSocket?.id) {
    receiverSocket.emit("challenge:resolved", payload);
  }

  broadcastLobbyPresence();
  return challenge;
}

function cancelChallengeForSocket(
  socketId: string,
  outcome: ChallengeResolvedOutcome,
  message: string
): void {
  const challengeId = challengeBySocket.get(socketId);
  if (!challengeId) {
    return;
  }
  resolveChallenge(challengeId, outcome, message);
}

function createRoomId(): string {
  return randomUUID().slice(0, 8);
}

function reconnectTimerKey(roomId: string, mark: PlayerMark): string {
  return `${roomId}:${mark}`;
}

function clearReconnectForfeitTimer(roomId: string, mark: PlayerMark): void {
  const key = reconnectTimerKey(roomId, mark);
  const timer = reconnectForfeitTimers.get(key);
  if (!timer) {
    return;
  }
  clearTimeout(timer);
  reconnectForfeitTimers.delete(key);
}

function clearReconnectForfeitTimersForRoom(roomId: string): void {
  clearReconnectForfeitTimer(roomId, "X");
  clearReconnectForfeitTimer(roomId, "O");
}

function clearTurnForfeitTimer(roomId: string): void {
  const timer = turnForfeitTimers.get(roomId);
  if (!timer) {
    return;
  }
  clearTimeout(timer);
  turnForfeitTimers.delete(roomId);
}

function clearContinueAvoidRetryTimer(socketId: string): void {
  const timer = continueAvoidRetryTimers.get(socketId);
  if (!timer) {
    return;
  }
  clearTimeout(timer);
  continueAvoidRetryTimers.delete(socketId);
}

function clearBotMoveTimer(roomId: string): void {
  const timer = botMoveTimers.get(roomId);
  if (!timer) {
    return;
  }
  clearTimeout(timer);
  botMoveTimers.delete(roomId);
}

function normalizeQueueMode(mode: QueueMode | undefined): QueueMode {
  return mode === "pve" ? "pve" : "pvp";
}

function normalizeBotLevel(level: BotLevel | undefined): BotLevel {
  return level === "normal" ? "normal" : "hard";
}

function humanMarksForRoom(room: RoomState): PlayerMark[] {
  if (room.botMark === "X") {
    return ["O"];
  }
  if (room.botMark === "O") {
    return ["X"];
  }
  return ["X", "O"];
}

function emitRoomUpdate(roomId: string): void {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }
  io.to(roomId).emit("room:update", {
    snapshot: snapshotFromRoomState(room)
  });
}

function scheduleBotMoveIfNeeded(roomId: string): void {
  clearBotMoveTimer(roomId);
  const room = rooms.get(roomId);
  if (!room || room.mode !== "pve" || !room.botMark || room.winner || room.turn !== room.botMark) {
    return;
  }

  const timeout = setTimeout(() => {
    botMoveTimers.delete(roomId);

    const currentRoom = rooms.get(roomId);
    if (
      !currentRoom ||
      currentRoom.mode !== "pve" ||
      !currentRoom.botMark ||
      currentRoom.winner ||
      currentRoom.turn !== currentRoom.botMark
    ) {
      return;
    }

    const moveDecision = chooseBestBotMove({
      board: [...currentRoom.board],
      size: currentRoom.size,
      connect: currentRoom.connect,
      winLinesIndex: currentRoom.winLinesIndex,
      botMark: currentRoom.botMark
    });

    const applyResult = applyMoveToRoom(currentRoom, currentRoom.botMark, moveDecision.coordinate);
    if (!applyResult.accepted) {
      if (applyResult.timedOut) {
        clearReconnectForfeitTimersForRoom(roomId);
        clearTurnForfeitTimer(roomId);
      }
      emitRoomUpdate(roomId);
      detachRoomIfAbandoned(roomId);
      return;
    }

    scheduleTurnForfeit(roomId);
    emitRoomUpdate(roomId);
    detachRoomIfAbandoned(roomId);
  }, BOT_THINK_DELAY_MS);

  botMoveTimers.set(roomId, timeout);
}

function scheduleTurnForfeit(roomId: string): void {
  const room = rooms.get(roomId);
  if (!room) {
    clearTurnForfeitTimer(roomId);
    return;
  }

  const deadlineAt = room.turnDeadlineAt;
  if (room.winner || deadlineAt === null) {
    clearTurnForfeitTimer(roomId);
    return;
  }

  clearTurnForfeitTimer(roomId);
  const timeout = setTimeout(() => {
    turnForfeitTimers.delete(roomId);
    const currentRoom = rooms.get(roomId);
    if (!currentRoom) {
      return;
    }

    const forfeited = applyTurnForfeitIfExpired(currentRoom, Date.now(), deadlineAt);
    if (!forfeited) {
      return;
    }

    clearReconnectForfeitTimersForRoom(roomId);
    emitRoomUpdate(roomId);
    detachRoomIfAbandoned(roomId);
  }, Math.max(0, deadlineAt - Date.now()));

  turnForfeitTimers.set(roomId, timeout);
}

function scheduleReconnectForfeit(roomId: string, mark: PlayerMark): void {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }

  const nowMs = Date.now();
  const deadlineAt = startReconnectDeadline(room, mark, nowMs, RECONNECT_GRACE_PERIOD_MS);
  if (deadlineAt === null) {
    return;
  }

  clearReconnectForfeitTimer(roomId, mark);

  const timeout = setTimeout(() => {
    reconnectForfeitTimers.delete(reconnectTimerKey(roomId, mark));

    const currentRoom = rooms.get(roomId);
    if (!currentRoom) {
      return;
    }

    const forfeited = applyDisconnectForfeitIfExpired(currentRoom, mark, Date.now());
    if (!forfeited) {
      return;
    }

    scheduleTurnForfeit(roomId);
    emitRoomUpdate(roomId);
    detachRoomIfAbandoned(roomId);
  }, Math.max(0, deadlineAt - nowMs));

  reconnectForfeitTimers.set(reconnectTimerKey(roomId, mark), timeout);
}

function detachRoomIfAbandoned(roomId: string): void {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }

  const humanMarks = humanMarksForRoom(room);
  const hasConnectedHuman = humanMarks.some((mark) => room.players[mark].connected);
  if (hasConnectedHuman) {
    return;
  }

  const hasReconnectGrace = !room.winner && humanMarks.some((mark) => {
    return room.players[mark].reconnectDeadlineAt !== null;
  });
  if (hasReconnectGrace) {
    return;
  }

  seatTokenMap.delete(room.players.X.seatToken);
  seatTokenMap.delete(room.players.O.seatToken);
  clearSpectatorsForRoom(roomId);
  clearReconnectForfeitTimersForRoom(roomId);
  clearTurnForfeitTimer(roomId);
  clearBotMoveTimer(roomId);
  rooms.delete(roomId);
  roomChatHistoryMap.delete(roomId);
}

function attachSocketToRoom(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  roomId: string
): void {
  socket.join(roomId);
  socketRoomMap.set(socket.id, roomId);
}

function emitGameError(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  message: string
): void {
  socket.emit("game:error", { message });
}

function resolveRoomAndMark(
  roomId: string,
  seatToken: string
): { room: RoomState; mark: PlayerMark } | null {
  const tokenRecord = seatTokenMap.get(seatToken);
  if (!tokenRecord || tokenRecord.roomId !== roomId) {
    return null;
  }

  const room = rooms.get(roomId);
  if (!room) {
    return null;
  }
  const mark = tokenRecord.mark;
  if (room.players[mark].seatToken !== seatToken) {
    return null;
  }
  return {
    room,
    mark
  };
}

function tryResolveChatSenderIdentity(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  roomId: string,
  seatToken: string | undefined,
  spectatorToken: string | undefined
): ChatSenderIdentity | null {
  if (seatToken) {
    const resolvedPlayer = resolveRoomAndMark(roomId, seatToken);
    if (resolvedPlayer) {
      const assignedSocketId = resolvedPlayer.room.players[resolvedPlayer.mark].socketId;
      if (assignedSocketId && assignedSocketId !== socket.id) {
        return null;
      }
      setPlayerConnection(resolvedPlayer.room, resolvedPlayer.mark, socket.id, true);
      clearReconnectForfeitTimer(roomId, resolvedPlayer.mark);
      clearReconnectDeadline(resolvedPlayer.room, resolvedPlayer.mark);
      attachSocketToRoom(socket, roomId);
      setLobbyStatus(socket.id, "in-game");
      return {
        room: resolvedPlayer.room,
        senderRole: "player",
        senderMark: resolvedPlayer.mark
      };
    }
  }

  if (spectatorToken) {
    const spectatorRoom = resolveRoomBySpectatorToken(roomId, spectatorToken);
    if (!spectatorRoom) {
      return null;
    }
    if (!bindSpectatorTokenToSocket(socket, roomId, spectatorToken)) {
      return null;
    }
    return {
      room: spectatorRoom,
      senderRole: "spectator",
      senderMark: null
    };
  }

  return null;
}

function startRoomMatch(
  firstSocket: Socket<ClientToServerEvents, ServerToClientEvents>,
  secondSocket: Socket<ClientToServerEvents, ServerToClientEvents>
): void {
  clearContinueAvoidRetryTimer(firstSocket.id);
  clearContinueAvoidRetryTimer(secondSocket.id);
  matchmaker.remove(firstSocket.id);
  matchmaker.remove(secondSocket.id);
  cancelChallengeForSocket(firstSocket.id, "cancelled", "挑战已取消");
  cancelChallengeForSocket(secondSocket.id, "cancelled", "挑战已取消");

  const roomId = createRoomId();
  const xSeatToken = randomUUID();
  const oSeatToken = randomUUID();
  const room = createRoomState({
    roomId,
    playerXSocketId: firstSocket.id,
    playerOSocketId: secondSocket.id,
    playerXSeatToken: xSeatToken,
    playerOSeatToken: oSeatToken
  });

  rooms.set(roomId, room);
  seatTokenMap.set(xSeatToken, { roomId, mark: "X" });
  seatTokenMap.set(oSeatToken, { roomId, mark: "O" });

  attachSocketToRoom(firstSocket, roomId);
  attachSocketToRoom(secondSocket, roomId);
  scheduleTurnForfeit(roomId);

  setLobbyStatus(firstSocket.id, "in-game");
  setLobbyStatus(secondSocket.id, "in-game");

  const snapshot = snapshotFromRoomState(room);
  firstSocket.emit("queue:matched", {
    roomId,
    mark: "X",
    seatToken: xSeatToken,
    snapshot
  });
  emitRoomChatHistoryToSocket(firstSocket, roomId);
  secondSocket.emit("queue:matched", {
    roomId,
    mark: "O",
    seatToken: oSeatToken,
    snapshot
  });
  emitRoomChatHistoryToSocket(secondSocket, roomId);

  broadcastLobbyPresence();
}

function startBotMatch(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  botLevel: BotLevel
): void {
  clearContinueAvoidRetryTimer(socket.id);
  matchmaker.remove(socket.id);
  cancelChallengeForSocket(socket.id, "cancelled", "挑战已取消");

  const roomId = createRoomId();
  const playerSeatToken = randomUUID();
  const botSeatToken = randomUUID();
  const room = createRoomState({
    roomId,
    playerXSocketId: socket.id,
    playerOSocketId: null,
    playerXSeatToken: playerSeatToken,
    playerOSeatToken: botSeatToken,
    mode: "pve",
    botMark: "O",
    botLevel
  });

  rooms.set(roomId, room);
  seatTokenMap.set(playerSeatToken, { roomId, mark: "X" });

  attachSocketToRoom(socket, roomId);
  scheduleTurnForfeit(roomId);
  setLobbyStatus(socket.id, "in-game");

  socket.emit("queue:matched", {
    roomId,
    mark: "X",
    seatToken: playerSeatToken,
    snapshot: snapshotFromRoomState(room)
  });
  emitRoomChatHistoryToSocket(socket, roomId);
  broadcastLobbyPresence();
}

function handleMatchPair(pair: { firstSocketId: string; secondSocketId: string }): void {
  clearContinueAvoidRetryTimer(pair.firstSocketId);
  clearContinueAvoidRetryTimer(pair.secondSocketId);

  const firstSocket = io.sockets.sockets.get(pair.firstSocketId);
  const secondSocket = io.sockets.sockets.get(pair.secondSocketId);

  if (!firstSocket || !secondSocket) {
    if (firstSocket) {
      matchmaker.enqueue(firstSocket.id);
      setLobbyStatus(firstSocket.id, "queuing");
      firstSocket.emit("queue:joined", {
        waitingForOpponent: true,
        queueSize: matchmaker.waitingCount
      });
    }
    if (secondSocket) {
      matchmaker.enqueue(secondSocket.id);
      setLobbyStatus(secondSocket.id, "queuing");
      secondSocket.emit("queue:joined", {
        waitingForOpponent: true,
        queueSize: matchmaker.waitingCount
      });
    }
    broadcastLobbyPresence();
    return;
  }
  startRoomMatch(firstSocket, secondSocket);
}

function tryMatchQueuedSockets(): void {
  const pair = matchmaker.tryMatch();
  if (!pair) {
    return;
  }
  handleMatchPair(pair);
}

function scheduleContinueAvoidRetry(socketId: string, avoidUntilMs: number): void {
  clearContinueAvoidRetryTimer(socketId);
  const timeout = setTimeout(() => {
    continueAvoidRetryTimers.delete(socketId);
    if (!matchmaker.has(socketId)) {
      return;
    }
    tryMatchQueuedSockets();
  }, Math.max(0, avoidUntilMs - Date.now()));
  continueAvoidRetryTimers.set(socketId, timeout);
}

function enqueueSocketForMatch(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  options?: MatchEnqueueOptions
): void {
  setLobbyStatus(socket.id, "queuing");
  const pair = matchmaker.enqueue(socket.id, options);
  if (!pair) {
    if (options?.avoidUntilMs !== null && options?.avoidUntilMs !== undefined) {
      scheduleContinueAvoidRetry(socket.id, options.avoidUntilMs);
    } else {
      clearContinueAvoidRetryTimer(socket.id);
    }

    socket.emit("queue:joined", {
      waitingForOpponent: true,
      queueSize: matchmaker.waitingCount
    });
    broadcastLobbyPresence();
    return;
  }

  handleMatchPair(pair);
}

io.on("connection", (socket) => {
  const initialProfile = ensureLobbyProfile(socket.id);
  initialProfile.displayName = normalizeDisplayName(
    initialProfile.displayName,
    fallbackDisplayName(socket.id)
  );
  setLobbyStatus(socket.id, socketRoomMap.has(socket.id) ? "in-game" : "idle");
  emitLobbyPresenceToSocket(socket);
  broadcastLobbyPresence();

  socket.on("lobby:presence:request", () => {
    emitLobbyPresenceToSocket(socket);
  });

  socket.on("lobby:nickname:update", ({ displayName }) => {
    const profile = ensureLobbyProfile(socket.id);
    const nextDisplayName = normalizeDisplayName(displayName, profile.displayName);
    if (nextDisplayName === profile.displayName) {
      return;
    }
    profile.displayName = nextDisplayName;
    broadcastLobbyPresence();
  });

  socket.on("challenge:send", ({ targetSocketId }) => {
    if (!targetSocketId || targetSocketId === socket.id) {
      emitGameError(socket, "请选择可挑战的在线玩家");
      return;
    }
    if (socketRoomMap.has(socket.id) || matchmaker.has(socket.id)) {
      emitGameError(socket, "当前状态无法发起挑战");
      return;
    }
    if (challengeBySocket.has(socket.id)) {
      emitGameError(socket, "你有尚未处理的挑战请求");
      return;
    }

    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (!targetSocket) {
      emitGameError(socket, "目标玩家已离线");
      return;
    }
    if (socketRoomMap.has(targetSocketId) || matchmaker.has(targetSocketId)) {
      emitGameError(socket, "目标玩家当前不可挑战");
      return;
    }
    if (challengeBySocket.has(targetSocketId)) {
      emitGameError(socket, "目标玩家正在处理其他挑战");
      return;
    }

    const senderProfile = ensureLobbyProfile(socket.id);
    const targetProfile = ensureLobbyProfile(targetSocketId);
    if (senderProfile.status !== "idle" || targetProfile.status !== "idle") {
      emitGameError(socket, "当前无法发起挑战");
      return;
    }

    const challengeId = randomUUID().slice(0, 12);
    const expiresAt = Date.now() + CHALLENGE_TIMEOUT_MS;
    const timeout = setTimeout(() => {
      resolveChallenge(challengeId, "expired", "挑战已超时");
    }, CHALLENGE_TIMEOUT_MS);

    const challenge: ChallengeState = {
      challengeId,
      fromSocketId: socket.id,
      toSocketId: targetSocketId,
      expiresAt,
      timeout
    };
    challenges.set(challengeId, challenge);
    challengeBySocket.set(socket.id, challengeId);
    challengeBySocket.set(targetSocketId, challengeId);

    socket.emit("challenge:outgoing", {
      challengeId,
      targetSocketId,
      targetDisplayName: targetProfile.displayName,
      expiresAt
    });
    targetSocket.emit("challenge:incoming", {
      challengeId,
      fromSocketId: socket.id,
      fromDisplayName: senderProfile.displayName,
      expiresAt
    });
    broadcastLobbyPresence();
  });

  socket.on("challenge:respond", ({ challengeId, accept }) => {
    const challenge = challenges.get(challengeId);
    if (!challenge) {
      emitGameError(socket, "挑战请求已失效");
      return;
    }
    if (challenge.toSocketId !== socket.id) {
      emitGameError(socket, "只有被挑战方可以应答");
      return;
    }

    const senderSocket = io.sockets.sockets.get(challenge.fromSocketId);
    if (!senderSocket) {
      resolveChallenge(challengeId, "cancelled", "对方已离线，挑战已取消");
      return;
    }
    if (!accept) {
      resolveChallenge(challengeId, "declined", "对方已拒绝挑战");
      return;
    }
    if (
      socketRoomMap.has(challenge.fromSocketId) ||
      socketRoomMap.has(challenge.toSocketId) ||
      matchmaker.has(challenge.fromSocketId) ||
      matchmaker.has(challenge.toSocketId)
    ) {
      resolveChallenge(challengeId, "cancelled", "玩家状态已变化，挑战已取消");
      return;
    }

    resolveChallenge(challengeId, "accepted", "挑战已接受，正在进入对局");
    startRoomMatch(senderSocket, socket);
  });

  socket.on("challenge:cancel", ({ challengeId }) => {
    const challenge = challenges.get(challengeId);
    if (!challenge) {
      return;
    }
    if (challenge.fromSocketId !== socket.id && challenge.toSocketId !== socket.id) {
      return;
    }
    resolveChallenge(challengeId, "cancelled", "挑战已取消");
  });

  socket.on("queue:join", ({ displayName, mode, botLevel }) => {
    if (socketRoomMap.has(socket.id)) {
      emitGameError(socket, "你已在房间中，请先离开当前对局");
      return;
    }

    if (displayName !== undefined) {
      const profile = ensureLobbyProfile(socket.id);
      profile.displayName = normalizeDisplayName(displayName, profile.displayName);
    }
    cancelChallengeForSocket(socket.id, "cancelled", "挑战已取消");

    const normalizedMode = normalizeQueueMode(mode);
    if (normalizedMode === "pve") {
      startBotMatch(socket, normalizeBotLevel(botLevel));
      return;
    }

    enqueueSocketForMatch(socket);
  });

  socket.on("queue:leave", () => {
    if (socketRoomMap.has(socket.id)) {
      emitGameError(socket, "你已在房间中，无法取消匹配");
      return;
    }

    cancelChallengeForSocket(socket.id, "cancelled", "挑战已取消");
    clearContinueAvoidRetryTimer(socket.id);
    matchmaker.remove(socket.id);
    setLobbyStatus(socket.id, "idle");
    socket.emit("queue:left", {
      queueSize: matchmaker.waitingCount
    });
    broadcastLobbyPresence();
  });

  socket.on("queue:continue", ({ roomId, seatToken }) => {
    const resolved = resolveRoomAndMark(roomId, seatToken);
    if (!resolved) {
      emitGameError(socket, "无效继续匹配请求");
      return;
    }
    if (resolved.room.mode === "pve") {
      emitGameError(socket, "人机对战无需继续匹配，请返回主界面重新开始");
      return;
    }

    if (!resolved.room.winner) {
      emitGameError(socket, "对局尚未结束，无法继续匹配");
      return;
    }

    const assignedSocketId = resolved.room.players[resolved.mark].socketId;
    if (assignedSocketId && assignedSocketId !== socket.id) {
      emitGameError(socket, "该席位已在其他设备在线");
      return;
    }
    const opponentMark: PlayerMark = resolved.mark === "X" ? "O" : "X";
    const opponentSocketId = resolved.room.players[opponentMark].socketId;
    const continueEnqueueOptions: MatchEnqueueOptions | undefined = opponentSocketId
      ? {
          avoidSocketId: opponentSocketId,
          avoidUntilMs: Date.now() + CONTINUE_AVOID_OPPONENT_MS
        }
      : undefined;

    cancelChallengeForSocket(socket.id, "cancelled", "挑战已取消");
    clearReconnectForfeitTimer(roomId, resolved.mark);
    clearReconnectDeadline(resolved.room, resolved.mark);

    setPlayerConnection(resolved.room, resolved.mark, null, false);
    socket.leave(roomId);
    socketRoomMap.delete(socket.id);
    seatTokenMap.delete(resolved.room.players[resolved.mark].seatToken);
    emitRoomUpdate(roomId);
    detachRoomIfAbandoned(roomId);

    matchmaker.remove(socket.id);
    enqueueSocketForMatch(socket, continueEnqueueOptions);
  });

  socket.on("room:spectate:join", ({ targetSocketId }) => {
    if (!targetSocketId || targetSocketId === socket.id) {
      emitSpectateJoinFailed(socket, "请选择正在对局的玩家");
      return;
    }

    if (socketRoomMap.has(socket.id)) {
      emitSpectateJoinFailed(socket, "你已在房间中，请先离开当前对局");
      return;
    }

    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (!targetSocket) {
      emitSpectateJoinFailed(socket, "目标玩家已离线");
      return;
    }

    const roomId = socketRoomMap.get(targetSocket.id);
    if (!roomId) {
      emitSpectateJoinFailed(socket, "目标玩家当前不在对局中");
      return;
    }

    const room = rooms.get(roomId);
    if (!room) {
      emitSpectateJoinFailed(socket, "目标对局已结束");
      return;
    }

    cancelChallengeForSocket(socket.id, "cancelled", "挑战已取消");
    clearContinueAvoidRetryTimer(socket.id);
    matchmaker.remove(socket.id);

    const spectatorToken = randomUUID();
    spectatorTokenMap.set(spectatorToken, {
      roomId,
      socketId: socket.id
    });
    spectatorSocketMap.set(socket.id, {
      roomId,
      spectatorToken
    });

    attachSocketToRoom(socket, roomId);
    setLobbyStatus(socket.id, "in-game");

    socket.emit("room:spectate:joined", {
      roomId,
      spectatorToken,
      snapshot: snapshotFromRoomState(room)
    });
    emitRoomChatHistoryToSocket(socket, roomId);
    emitRoomUpdate(roomId);
    broadcastLobbyPresence();
  });

  socket.on("room:resume", ({ roomId, seatToken }) => {
    const tokenRecord = seatTokenMap.get(seatToken);
    if (!tokenRecord || tokenRecord.roomId !== roomId) {
      socket.emit("room:resume-failed", {
        reason: "重连凭证无效，请重新匹配"
      });
      return;
    }

    const room = rooms.get(roomId);
    if (!room) {
      socket.emit("room:resume-failed", {
        reason: "房间已不存在，请重新匹配"
      });
      return;
    }

    const mark = tokenRecord.mark;
    const previousSocketId = room.players[mark].socketId;
    if (previousSocketId && previousSocketId !== socket.id) {
      socketRoomMap.delete(previousSocketId);
      const previousSocket = io.sockets.sockets.get(previousSocketId);
      if (previousSocket) {
        previousSocket.disconnect(true);
      }
    }

    cancelChallengeForSocket(socket.id, "cancelled", "挑战已取消");
    clearSpectatorSessionBySocket(socket.id);
    setPlayerConnection(room, mark, socket.id, true);
    clearReconnectForfeitTimer(roomId, mark);
    clearReconnectDeadline(room, mark);
    attachSocketToRoom(socket, roomId);
    setLobbyStatus(socket.id, "in-game");

    socket.emit("room:resumed", {
      roomId,
      mark,
      seatToken,
      snapshot: snapshotFromRoomState(room)
    });
    emitRoomChatHistoryToSocket(socket, roomId);
    emitRoomUpdate(roomId);
    scheduleBotMoveIfNeeded(roomId);
    broadcastLobbyPresence();
  });

  socket.on("room:state:request", ({ roomId, seatToken, spectatorToken }) => {
    if (seatToken) {
      const resolvedPlayer = resolveRoomAndMark(roomId, seatToken);
      if (resolvedPlayer) {
        socket.emit("room:update", {
          snapshot: snapshotFromRoomState(resolvedPlayer.room)
        });
        emitRoomChatHistoryToSocket(socket, roomId);
        return;
      }
    }

    if (!spectatorToken) {
      return;
    }
    const spectatorRoom = resolveRoomBySpectatorToken(roomId, spectatorToken);
    if (!spectatorRoom) {
      return;
    }
    if (!bindSpectatorTokenToSocket(socket, roomId, spectatorToken)) {
      return;
    }
    socket.emit("room:update", {
      snapshot: snapshotFromRoomState(spectatorRoom)
    });
    emitRoomChatHistoryToSocket(socket, roomId);
  });

  socket.on("room:chat:send", ({ roomId, seatToken, spectatorToken, message }) => {
    const senderIdentity = tryResolveChatSenderIdentity(socket, roomId, seatToken, spectatorToken);
    if (!senderIdentity) {
      emitGameError(socket, "无效聊天请求");
      return;
    }

    const normalizedMessage = normalizeChatMessage(message);
    if (!normalizedMessage) {
      return;
    }

    const nowMs = Date.now();
    if (!canSendRoomChat(socket.id, nowMs)) {
      emitGameError(socket, "发送太快了，请稍后再试");
      return;
    }

    const baseDisplayName = ensureLobbyProfile(socket.id).displayName;
    const senderDisplayName =
      senderIdentity.senderRole === "spectator" ? `${baseDisplayName}(观战)` : baseDisplayName;

    const messagePayload: RoomChatMessage = {
      id: randomUUID().slice(0, 12),
      roomId,
      senderMark: senderIdentity.senderMark,
      senderRole: senderIdentity.senderRole,
      senderDisplayName,
      message: normalizedMessage,
      sentAt: nowMs
    };
    appendRoomChatMessage(roomId, messagePayload);
    io.to(roomId).emit("room:chat:message", {
      roomId,
      message: messagePayload
    });
  });

  socket.on("game:place", ({ roomId, seatToken, clientMoveId, x, y, z }) => {
    if (!clientMoveId) {
      emitGameError(socket, "落子请求缺少 clientMoveId");
      return;
    }

    const resolved = resolveRoomAndMark(roomId, seatToken);
    if (!resolved) {
      socket.emit("game:move:ack", {
        clientMoveId,
        accepted: false,
        reason: "无效落子请求"
      });
      return;
    }
    const { room, mark } = resolved;

    const recordedAck = getRecordedMoveAck(room, mark, clientMoveId);
    if (recordedAck) {
      socket.emit("game:move:ack", {
        clientMoveId,
        ...recordedAck
      });
      return;
    }

    const assignedSocketId = room.players[mark].socketId;
    if (assignedSocketId && assignedSocketId !== socket.id) {
      const ack = {
        accepted: false,
        reason: "该席位已在其他设备在线"
      };
      recordMoveAck(room, mark, clientMoveId, ack);
      socket.emit("game:move:ack", {
        clientMoveId,
        ...ack
      });
      return;
    }

    setPlayerConnection(room, mark, socket.id, true);
    clearReconnectForfeitTimer(roomId, mark);
    clearReconnectDeadline(room, mark);
    attachSocketToRoom(socket, roomId);
    setLobbyStatus(socket.id, "in-game");

    const applyResult = applyMoveToRoom(room, mark, { x, y, z });
    if (!applyResult.accepted) {
      const ack = {
        accepted: false,
        reason: applyResult.reason ?? "落子失败"
      };
      recordMoveAck(room, mark, clientMoveId, ack);
      socket.emit("game:move:ack", {
        clientMoveId,
        ...ack
      });
      if (applyResult.timedOut) {
        clearReconnectForfeitTimersForRoom(roomId);
        clearTurnForfeitTimer(roomId);
        emitRoomUpdate(roomId);
        detachRoomIfAbandoned(roomId);
      }
      return;
    }

    const ack = {
      accepted: true,
      roomMoveNumber: room.moveCount
    };
    recordMoveAck(room, mark, clientMoveId, ack);
    socket.emit("game:move:ack", {
      clientMoveId,
      ...ack
    });
    scheduleTurnForfeit(roomId);
    emitRoomUpdate(roomId);
    scheduleBotMoveIfNeeded(roomId);
  });

  socket.on("game:rematch", ({ roomId, seatToken }) => {
    const resolved = resolveRoomAndMark(roomId, seatToken);
    if (!resolved) {
      emitGameError(socket, "无效再来一局请求");
      return;
    }
    const assignedSocketId = resolved.room.players[resolved.mark].socketId;
    if (assignedSocketId && assignedSocketId !== socket.id) {
      emitGameError(socket, "该席位已在其他设备在线");
      return;
    }

    setPlayerConnection(resolved.room, resolved.mark, socket.id, true);
    clearReconnectForfeitTimer(roomId, resolved.mark);
    clearReconnectDeadline(resolved.room, resolved.mark);
    attachSocketToRoom(socket, roomId);
    setLobbyStatus(socket.id, "in-game");

    const rematchResult = requestRematch(resolved.room, resolved.mark);
    if (!rematchResult.accepted) {
      emitGameError(socket, rematchResult.reason ?? "再来一局请求失败");
      return;
    }

    if (!rematchResult.started && resolved.room.botMark && resolved.room.botMark !== resolved.mark) {
      requestRematch(resolved.room, resolved.room.botMark);
    }

    scheduleTurnForfeit(roomId);
    emitRoomUpdate(roomId);
    scheduleBotMoveIfNeeded(roomId);
  });

  socket.on("game:surrender", ({ roomId, seatToken }) => {
    const resolved = resolveRoomAndMark(roomId, seatToken);
    if (!resolved) {
      emitGameError(socket, "无效认输请求");
      return;
    }
    const assignedSocketId = resolved.room.players[resolved.mark].socketId;
    if (assignedSocketId && assignedSocketId !== socket.id) {
      emitGameError(socket, "该席位已在其他设备在线");
      return;
    }

    setPlayerConnection(resolved.room, resolved.mark, socket.id, true);
    clearReconnectForfeitTimer(roomId, resolved.mark);
    clearReconnectDeadline(resolved.room, resolved.mark);
    attachSocketToRoom(socket, roomId);
    setLobbyStatus(socket.id, "in-game");

    const surrenderResult = requestSurrender(resolved.room, resolved.mark);
    if (!surrenderResult.accepted) {
      emitGameError(socket, surrenderResult.reason ?? "认输请求失败");
      return;
    }

    scheduleTurnForfeit(roomId);
    emitRoomUpdate(roomId);
  });

  socket.on("game:rematch:cancel", ({ roomId, seatToken }) => {
    const resolved = resolveRoomAndMark(roomId, seatToken);
    if (!resolved) {
      emitGameError(socket, "无效取消再来一局请求");
      return;
    }
    const assignedSocketId = resolved.room.players[resolved.mark].socketId;
    if (assignedSocketId && assignedSocketId !== socket.id) {
      emitGameError(socket, "该席位已在其他设备在线");
      return;
    }

    setPlayerConnection(resolved.room, resolved.mark, socket.id, true);
    clearReconnectForfeitTimer(roomId, resolved.mark);
    clearReconnectDeadline(resolved.room, resolved.mark);
    attachSocketToRoom(socket, roomId);
    setLobbyStatus(socket.id, "in-game");

    const cancelResult = cancelRematch(resolved.room, resolved.mark);
    if (!cancelResult.accepted) {
      emitGameError(socket, cancelResult.reason ?? "取消再来一局请求失败");
      return;
    }

    emitRoomUpdate(roomId);
  });

  socket.on("disconnect", () => {
    clearContinueAvoidRetryTimer(socket.id);
    matchmaker.remove(socket.id);
    cancelChallengeForSocket(socket.id, "cancelled", "对方已离线，挑战已取消");
    clearSpectatorSessionBySocket(socket.id);
    lobbyProfiles.delete(socket.id);
    roomChatRateLimitMap.delete(socket.id);

    const roomId = socketRoomMap.get(socket.id);
    socketRoomMap.delete(socket.id);
    if (!roomId) {
      broadcastLobbyPresence();
      return;
    }

    const room = rooms.get(roomId);
    if (!room) {
      broadcastLobbyPresence();
      return;
    }

    const mark = markForSocket(room, socket.id);
    if (!mark) {
      broadcastLobbyPresence();
      return;
    }

    clearReconnectForfeitTimer(roomId, mark);
    setPlayerConnection(room, mark, null, false);
    if (room.winner) {
      clearReconnectDeadline(room, mark);
      clearTurnDeadline(room);
      clearTurnForfeitTimer(roomId);
    } else {
      scheduleReconnectForfeit(roomId, mark);
    }
    emitRoomUpdate(roomId);
    detachRoomIfAbandoned(roomId);
    broadcastLobbyPresence();
  });
});

httpServer.listen(port, () => {
  console.log(`Nebula Cube server running at http://localhost:${port}`);
});
