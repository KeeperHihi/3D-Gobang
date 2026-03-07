export type ContinueTransitionPhase = "idle" | "submitting" | "queued" | "rollback";

export interface ContinueTransitionState {
  phase: ContinueTransitionPhase;
  requestId: number;
}

export type ContinueTransitionEvent =
  | { type: "REQUEST" }
  | { type: "SERVER_ACCEPT"; requestId: number }
  | { type: "SERVER_REJECT"; requestId: number }
  | { type: "RESET" };

export interface ContinueRollbackRestoreInput {
  backupRoomId: string;
  currentSessionRoomId: string | null;
  currentSnapshotRoomId: string | null;
  currentWinner: "X" | "O" | "draw" | null;
}

export function createInitialContinueTransitionState(): ContinueTransitionState {
  return {
    phase: "idle",
    requestId: 0
  };
}

export function reduceContinueTransition(
  state: ContinueTransitionState,
  event: ContinueTransitionEvent
): ContinueTransitionState {
  if (event.type === "REQUEST") {
    if (state.phase === "submitting") {
      return state;
    }
    return {
      phase: "submitting",
      requestId: state.requestId + 1
    };
  }

  if (event.type === "SERVER_ACCEPT") {
    if (state.phase !== "submitting" || event.requestId !== state.requestId) {
      return state;
    }
    return {
      ...state,
      phase: "queued"
    };
  }

  if (event.type === "SERVER_REJECT") {
    if (state.phase !== "submitting" || event.requestId !== state.requestId) {
      return state;
    }
    return {
      ...state,
      phase: "rollback"
    };
  }

  if (state.phase === "idle") {
    return state;
  }
  return {
    ...state,
    phase: "idle"
  };
}

export function shouldRestoreContinueMatchBackup(input: ContinueRollbackRestoreInput): boolean {
  if (!input.currentSessionRoomId || input.currentSessionRoomId !== input.backupRoomId) {
    return true;
  }
  if (!input.currentSnapshotRoomId || input.currentSnapshotRoomId !== input.backupRoomId) {
    return true;
  }
  if (input.currentWinner === null) {
    return false;
  }
  return true;
}
