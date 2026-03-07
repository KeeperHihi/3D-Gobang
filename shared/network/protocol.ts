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
    reconnectDeadlineAt: number | null;
  };
  O: {
    connected: boolean;
    reconnectDeadlineAt: number | null;
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

export interface QueueLeftPayload {
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

export interface QueueLeavePayload {}

export interface QueueContinuePayload {
  roomId: string;
  seatToken: string;
}

export interface PlaceMovePayload {
  roomId: string;
  seatToken: string;
  clientMoveId: string;
  x: number;
  y: number;
  z: number;
}

export interface MoveAckPayload {
  clientMoveId: string;
  accepted: boolean;
  reason?: string;
  roomMoveNumber?: number;
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
  "queue:leave": (payload: QueueLeavePayload) => void;
  "queue:continue": (payload: QueueContinuePayload) => void;
  "game:place": (payload: PlaceMovePayload) => void;
  "game:rematch": (payload: RematchPayload) => void;
  "room:resume": (payload: ResumePayload) => void;
  "room:state:request": (payload: RequestStatePayload) => void;
}

export interface ServerToClientEvents {
  "queue:joined": (payload: QueueJoinedPayload) => void;
  "queue:left": (payload: QueueLeftPayload) => void;
  "queue:matched": (payload: QueueMatchedPayload) => void;
  "room:update": (payload: RoomUpdatePayload) => void;
  "room:resumed": (payload: RoomResumedPayload) => void;
  "room:resume-failed": (payload: ResumeFailedPayload) => void;
  "game:move:ack": (payload: MoveAckPayload) => void;
  "game:error": (payload: ErrorPayload) => void;
}
