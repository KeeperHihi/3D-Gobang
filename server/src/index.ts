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
  applyMoveToRoom,
  createRoomState,
  getRecordedMoveAck,
  markForSeatToken,
  markForSocket,
  recordMoveAck,
  requestRematch,
  setPlayerConnection,
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

function createRoomId(): string {
  return randomUUID().slice(0, 8);
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
  const room = rooms.get(roomId);
  if (!room) {
    return null;
  }
  const mark = markForSeatToken(room, seatToken);
  if (!mark) {
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

io.on("connection", (socket) => {
  socket.on("queue:join", () => {
    if (socketRoomMap.has(socket.id)) {
      emitGameError(socket, "你已在房间中，请先离开当前对局");
      return;
    }

    const pair = matchmaker.enqueue(socket.id);
    if (!pair) {
      socket.emit("queue:joined", {
        waitingForOpponent: true,
        queueSize: matchmaker.waitingCount
      });
      return;
    }

    handleMatchPair(pair);
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

    setPlayerConnection(room, mark, null, false);
    emitRoomUpdate(roomId);
    detachRoomIfAbandoned(roomId);
  });
});

httpServer.listen(port, () => {
  console.log(`Nebula Cube server running at http://localhost:${port}`);
});
