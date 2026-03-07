import { io } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "./protocol";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";

export function createSocketClient() {
  return io<ServerToClientEvents, ClientToServerEvents>(SERVER_URL, {
    autoConnect: false,
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: 12,
    reconnectionDelay: 500
  });
}
