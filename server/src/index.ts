import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import { Server, type Socket } from "socket.io";
import { Matchmaker } from "./matchmaker";
import type {
  ClientToServerEvents,
  PlayerMark,
  ServerToClientEvents
} from "../../shared/network/protocol";
import {
  applyDisconnectForfeitIfExpired,
  applyMoveToRoom,
  clearReconnectDeadline,
  createRoomState,
  getRecordedMoveAck,
  markForSocket,
  recordMoveAck,
  requestRematch,
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
const socketRoomMap = new Map<string, string>();
const reconnectForfeitTimers = new Map<string, NodeJS.Timeout>();
const RECONNECT_GRACE_PERIOD_MS = 30_000;

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

function emitRoomUpdate(roomId: string): void {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }
  io.to(roomId).emit("room:update", {
    snapshot: snapshotFromRoomState(room)
  });
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
  if (room.players.X.connected || room.players.O.connected) {
    return;
  }
  seatTokenMap.delete(room.players.X.seatToken);
  seatTokenMap.delete(room.players.O.seatToken);
  clearReconnectForfeitTimersForRoom(roomId);
  rooms.delete(roomId);
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

function handleMatchPair(pair: { firstSocketId: string; secondSocketId: string }): void {
  const firstSocket = io.sockets.sockets.get(pair.firstSocketId);
  const secondSocket = io.sockets.sockets.get(pair.secondSocketId);

  if (!firstSocket || !secondSocket) {
    if (firstSocket) {
      matchmaker.enqueue(firstSocket.id);
      firstSocket.emit("queue:joined", {
        waitingForOpponent: true,
        queueSize: matchmaker.waitingCount
      });
    }
    if (secondSocket) {
      matchmaker.enqueue(secondSocket.id);
      secondSocket.emit("queue:joined", {
        waitingForOpponent: true,
        queueSize: matchmaker.waitingCount
      });
    }
    return;
  }

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

  const snapshot = snapshotFromRoomState(room);
  firstSocket.emit("queue:matched", {
    roomId,
    mark: "X",
    seatToken: xSeatToken,
    snapshot
  });
  secondSocket.emit("queue:matched", {
    roomId,
    mark: "O",
    seatToken: oSeatToken,
    snapshot
  });
}

function enqueueSocketForMatch(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>
): void {
  const pair = matchmaker.enqueue(socket.id);
  if (!pair) {
    socket.emit("queue:joined", {
      waitingForOpponent: true,
      queueSize: matchmaker.waitingCount
    });
    return;
  }

  handleMatchPair(pair);
}

io.on("connection", (socket) => {
  socket.on("queue:join", () => {
    if (socketRoomMap.has(socket.id)) {
      emitGameError(socket, "你已在房间中，请先离开当前对局");
      return;
    }

    enqueueSocketForMatch(socket);
  });

  socket.on("queue:continue", ({ roomId, seatToken }) => {
    const resolved = resolveRoomAndMark(roomId, seatToken);
    if (!resolved) {
      emitGameError(socket, "无效继续匹配请求");
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

    clearReconnectForfeitTimer(roomId, resolved.mark);
    clearReconnectDeadline(resolved.room, resolved.mark);

    setPlayerConnection(resolved.room, resolved.mark, null, false);
    socket.leave(roomId);
    socketRoomMap.delete(socket.id);
    seatTokenMap.delete(resolved.room.players[resolved.mark].seatToken);
    emitRoomUpdate(roomId);
    detachRoomIfAbandoned(roomId);

    matchmaker.remove(socket.id);
    enqueueSocketForMatch(socket);
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

    setPlayerConnection(room, mark, socket.id, true);
    clearReconnectForfeitTimer(roomId, mark);
    clearReconnectDeadline(room, mark);
    attachSocketToRoom(socket, roomId);

    socket.emit("room:resumed", {
      roomId,
      mark,
      seatToken,
      snapshot: snapshotFromRoomState(room)
    });
    emitRoomUpdate(roomId);
  });

  socket.on("room:state:request", ({ roomId, seatToken }) => {
    const resolved = resolveRoomAndMark(roomId, seatToken);
    if (!resolved) {
      return;
    }
    socket.emit("room:update", {
      snapshot: snapshotFromRoomState(resolved.room)
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
    emitRoomUpdate(roomId);
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

    const rematchResult = requestRematch(resolved.room, resolved.mark);
    if (!rematchResult.accepted) {
      emitGameError(socket, rematchResult.reason ?? "再来一局请求失败");
      return;
    }

    emitRoomUpdate(roomId);
  });

  socket.on("disconnect", () => {
    matchmaker.remove(socket.id);

    const roomId = socketRoomMap.get(socket.id);
    socketRoomMap.delete(socket.id);
    if (!roomId) {
      return;
    }

    const room = rooms.get(roomId);
    if (!room) {
      return;
    }

    const mark = markForSocket(room, socket.id);
    if (!mark) {
      return;
    }

    clearReconnectForfeitTimer(roomId, mark);
    setPlayerConnection(room, mark, null, false);
    if (room.winner) {
      clearReconnectDeadline(room, mark);
    } else {
      scheduleReconnectForfeit(roomId, mark);
    }
    emitRoomUpdate(roomId);
    detachRoomIfAbandoned(roomId);
  });
});

httpServer.listen(port, () => {
  console.log(`Nebula Cube server running at http://localhost:${port}`);
});
