import { describe, expect, it } from "vitest";
import {
  createInitialContinueTransitionState,
  reduceContinueTransition,
  shouldRestoreContinueMatchBackup
} from "./continueTransition";

describe("continue transition state machine", () => {
  it("flows from request to queued on server accept", () => {
    const initial = createInitialContinueTransitionState();
    const submitting = reduceContinueTransition(initial, { type: "REQUEST" });
    const queued = reduceContinueTransition(submitting, {
      type: "SERVER_ACCEPT",
      requestId: submitting.requestId
    });

    expect(submitting.phase).toBe("submitting");
    expect(queued.phase).toBe("queued");
  });

  it("rolls back on server reject", () => {
    const submitting = reduceContinueTransition(createInitialContinueTransitionState(), {
      type: "REQUEST"
    });
    const rollback = reduceContinueTransition(submitting, {
      type: "SERVER_REJECT",
      requestId: submitting.requestId
    });

    expect(rollback.phase).toBe("rollback");
  });

  it("ignores duplicate request while submitting", () => {
    const submitting = reduceContinueTransition(createInitialContinueTransitionState(), {
      type: "REQUEST"
    });
    const duplicateRequest = reduceContinueTransition(submitting, {
      type: "REQUEST"
    });

    expect(duplicateRequest).toBe(submitting);
    expect(duplicateRequest.requestId).toBe(1);
  });

  it("allows retrigger after reset", () => {
    const submitting = reduceContinueTransition(createInitialContinueTransitionState(), {
      type: "REQUEST"
    });
    const rollback = reduceContinueTransition(submitting, {
      type: "SERVER_REJECT",
      requestId: submitting.requestId
    });
    const reset = reduceContinueTransition(rollback, { type: "RESET" });
    const retry = reduceContinueTransition(reset, { type: "REQUEST" });

    expect(reset.phase).toBe("idle");
    expect(retry.phase).toBe("submitting");
    expect(retry.requestId).toBe(2);
  });
});

describe("shouldRestoreContinueMatchBackup", () => {
  it("restores when current session is missing", () => {
    const shouldRestore = shouldRestoreContinueMatchBackup({
      backupRoomId: "room-1",
      currentSessionRoomId: null,
      currentSnapshotRoomId: "room-1",
      currentWinner: "X"
    });

    expect(shouldRestore).toBe(true);
  });

  it("restores when session or snapshot room mismatches backup", () => {
    const bySession = shouldRestoreContinueMatchBackup({
      backupRoomId: "room-1",
      currentSessionRoomId: "room-2",
      currentSnapshotRoomId: "room-1",
      currentWinner: "X"
    });
    const bySnapshot = shouldRestoreContinueMatchBackup({
      backupRoomId: "room-1",
      currentSessionRoomId: "room-1",
      currentSnapshotRoomId: "room-2",
      currentWinner: "X"
    });

    expect(bySession).toBe(true);
    expect(bySnapshot).toBe(true);
  });

  it("skips restore when authoritative snapshot already entered ongoing round", () => {
    const shouldRestore = shouldRestoreContinueMatchBackup({
      backupRoomId: "room-1",
      currentSessionRoomId: "room-1",
      currentSnapshotRoomId: "room-1",
      currentWinner: null
    });

    expect(shouldRestore).toBe(false);
  });
});
