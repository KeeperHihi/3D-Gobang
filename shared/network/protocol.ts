export type PlayerMark = "X" | "O";
export type Winner = PlayerMark | "draw" | null;

export interface Coordinate3D {
  x: number;
  y: number;
  z: number;
}

export interface MoveRecord extends Coordinate3D {
  player: PlayerMark;
  moveNumber: number;
  timestamp: number;
}

export interface RoomPlayersSnapshot {
  X: {
    connected: boolean;
  };
  O: {
    connected: boolean;
  };
}

export interface RoomSnapshot {
  roomId: string;
  size: number;
  connect: number;
  board: number[];
  turn: PlayerMark;
  winner: Winner;
  lastMove: MoveRecord | null;
  winningLine: number[] | null;
  players: RoomPlayersSnapshot;
}

export interface QueueJoinedPayload {
  waitingForOpponent: boolean;
  queueSize: number;
}

export interface QueueMatchedPayload {
  roomId: string;
  mark: PlayerMark;
  seatToken: string;
  snapshot: RoomSnapshot;
}

export interface RoomResumedPayload {
  roomId: string;
  mark: PlayerMark;
  seatToken: string;
  snapshot: RoomSnapshot;
}

export interface RoomUpdatePayload {
  snapshot: RoomSnapshot;
}

export interface ErrorPayload {
  message: string;
}

export interface ResumeFailedPayload {
  reason: string;
}

export interface QueueJoinPayload {
  displayName?: string;
}

export interface PlaceMovePayload {
  roomId: string;
  seatToken: string;
  x: number;
  y: number;
  z: number;
}

export interface RematchPayload {
  roomId: string;
  seatToken: string;
}

export interface ResumePayload {
  roomId: string;
  seatToken: string;
}

export interface RequestStatePayload {
  roomId: string;
  seatToken: string;
}

export interface ClientToServerEvents {
  "queue:join": (payload: QueueJoinPayload) => void;
  "game:place": (payload: PlaceMovePayload) => void;
  "game:rematch": (payload: RematchPayload) => void;
  "room:resume": (payload: ResumePayload) => void;
  "room:state:request": (payload: RequestStatePayload) => void;
}

export interface ServerToClientEvents {
  "queue:joined": (payload: QueueJoinedPayload) => void;
  "queue:matched": (payload: QueueMatchedPayload) => void;
  "room:update": (payload: RoomUpdatePayload) => void;
  "room:resumed": (payload: RoomResumedPayload) => void;
  "room:resume-failed": (payload: ResumeFailedPayload) => void;
  "game:error": (payload: ErrorPayload) => void;
}
