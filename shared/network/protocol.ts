export type PlayerMark = "X" | "O";
export type Winner = PlayerMark | "draw" | null;
export type QueueMode = "pvp" | "pve";
export type BotLevel = "normal" | "hard";

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
  mode?: QueueMode;
  botLevel?: BotLevel | null;
  botMark?: PlayerMark | null;
  board: number[];
  turn: PlayerMark;
  turnDeadlineAt: number | null;
  winner: Winner;
  lastMove: MoveRecord | null;
  winningLine: number[] | null;
  players: RoomPlayersSnapshot;
  rematchReady: {
    X: boolean;
    O: boolean;
  };
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
  mode?: QueueMode;
  botLevel?: BotLevel;
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

export interface RematchCancelPayload {
  roomId: string;
  seatToken: string;
}

export interface SurrenderPayload {
  roomId: string;
  seatToken: string;
}

export interface ResumePayload {
  roomId: string;
  seatToken: string;
}

export interface RequestStatePayload {
  roomId: string;
  seatToken?: string;
  spectatorToken?: string;
}

export type LobbyPresenceStatus = "idle" | "queuing" | "in-game" | "spectating" | "challenge";

export interface LobbyPlayerSnapshot {
  socketId: string;
  displayName: string;
  status: LobbyPresenceStatus;
  isSelf: boolean;
}

export interface LobbyPresencePayload {
  selfSocketId: string;
  players: LobbyPlayerSnapshot[];
}

export interface LobbyNicknameUpdatePayload {
  displayName: string;
}

export interface ChallengeSendPayload {
  targetSocketId: string;
}

export interface ChallengeRespondPayload {
  challengeId: string;
  accept: boolean;
}

export interface ChallengeCancelPayload {
  challengeId: string;
}

export interface ChallengeIncomingPayload {
  challengeId: string;
  fromSocketId: string;
  fromDisplayName: string;
  expiresAt: number;
}

export interface ChallengeOutgoingPayload {
  challengeId: string;
  targetSocketId: string;
  targetDisplayName: string;
  expiresAt: number;
}

export type ChallengeResolvedOutcome = "accepted" | "declined" | "cancelled" | "expired";

export interface ChallengeResolvedPayload {
  challengeId: string;
  outcome: ChallengeResolvedOutcome;
  message: string;
}

export interface RoomChatSendPayload {
  roomId: string;
  seatToken?: string;
  spectatorToken?: string;
  message: string;
}

export type RoomChatSenderRole = "player" | "spectator";

export interface RoomChatMessage {
  id: string;
  roomId: string;
  senderMark: PlayerMark | null;
  senderRole: RoomChatSenderRole;
  senderDisplayName: string;
  message: string;
  sentAt: number;
}

export interface SpectateJoinPayload {
  targetSocketId: string;
}

export interface SpectateJoinedPayload {
  roomId: string;
  spectatorToken: string;
  snapshot: RoomSnapshot;
}

export interface SpectateJoinFailedPayload {
  reason: string;
}

export interface RoomChatMessagePayload {
  roomId: string;
  message: RoomChatMessage;
}

export interface RoomChatHistoryPayload {
  roomId: string;
  messages: RoomChatMessage[];
}

export interface ClientToServerEvents {
  "queue:join": (payload: QueueJoinPayload) => void;
  "queue:leave": (payload: QueueLeavePayload) => void;
  "queue:continue": (payload: QueueContinuePayload) => void;
  "lobby:presence:request": () => void;
  "lobby:nickname:update": (payload: LobbyNicknameUpdatePayload) => void;
  "challenge:send": (payload: ChallengeSendPayload) => void;
  "challenge:respond": (payload: ChallengeRespondPayload) => void;
  "challenge:cancel": (payload: ChallengeCancelPayload) => void;
  "game:place": (payload: PlaceMovePayload) => void;
  "game:surrender": (payload: SurrenderPayload) => void;
  "game:rematch": (payload: RematchPayload) => void;
  "game:rematch:cancel": (payload: RematchCancelPayload) => void;
  "room:resume": (payload: ResumePayload) => void;
  "room:spectate:join": (payload: SpectateJoinPayload) => void;
  "room:state:request": (payload: RequestStatePayload) => void;
  "room:chat:send": (payload: RoomChatSendPayload) => void;
}

export interface ServerToClientEvents {
  "queue:joined": (payload: QueueJoinedPayload) => void;
  "queue:left": (payload: QueueLeftPayload) => void;
  "queue:matched": (payload: QueueMatchedPayload) => void;
  "lobby:presence": (payload: LobbyPresencePayload) => void;
  "challenge:incoming": (payload: ChallengeIncomingPayload) => void;
  "challenge:outgoing": (payload: ChallengeOutgoingPayload) => void;
  "challenge:resolved": (payload: ChallengeResolvedPayload) => void;
  "room:update": (payload: RoomUpdatePayload) => void;
  "room:resumed": (payload: RoomResumedPayload) => void;
  "room:resume-failed": (payload: ResumeFailedPayload) => void;
  "room:spectate:joined": (payload: SpectateJoinedPayload) => void;
  "room:spectate:join-failed": (payload: SpectateJoinFailedPayload) => void;
  "room:chat:message": (payload: RoomChatMessagePayload) => void;
  "room:chat:history": (payload: RoomChatHistoryPayload) => void;
  "game:move:ack": (payload: MoveAckPayload) => void;
  "game:error": (payload: ErrorPayload) => void;
}
