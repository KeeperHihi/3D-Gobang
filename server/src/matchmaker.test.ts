import { describe, expect, it } from "vitest";
import { Matchmaker } from "./matchmaker";

describe("Matchmaker", () => {
  it("pairs two sockets in FIFO order", () => {
    const matchmaker = new Matchmaker();
    const firstResult = matchmaker.enqueue("socket-a");
    const secondResult = matchmaker.enqueue("socket-b");

    expect(firstResult).toBeNull();
    expect(secondResult).toEqual({
      firstSocketId: "socket-a",
      secondSocketId: "socket-b"
    });
    expect(matchmaker.waitingCount).toBe(0);
  });

  it("does not duplicate the same socket in queue", () => {
    const matchmaker = new Matchmaker();
    matchmaker.enqueue("socket-a");
    const duplicateResult = matchmaker.enqueue("socket-a");

    expect(duplicateResult).toBeNull();
    expect(matchmaker.waitingCount).toBe(1);
  });

  it("removes disconnected socket from waiting queue", () => {
    const matchmaker = new Matchmaker();
    matchmaker.enqueue("socket-a");
    matchmaker.enqueue("socket-b");
    matchmaker.enqueue("socket-c");

    matchmaker.remove("socket-c");
    expect(matchmaker.waitingCount).toBe(0);
  });

  it("supports queued socket existence query", () => {
    const matchmaker = new Matchmaker();
    matchmaker.enqueue("socket-a");

    expect(matchmaker.has("socket-a")).toBe(true);
    expect(matchmaker.has("socket-b")).toBe(false);
  });

  it("avoids immediately rematching the same opponent during cooldown", () => {
    let nowMs = 10_000;
    const matchmaker = new Matchmaker(() => nowMs);

    matchmaker.enqueue("socket-a", {
      avoidSocketId: "socket-b",
      avoidUntilMs: nowMs + 20_000
    });
    const blockedByAvoid = matchmaker.enqueue("socket-b");
    const matchedWithAlternative = matchmaker.enqueue("socket-c");

    expect(blockedByAvoid).toBeNull();
    expect(matchedWithAlternative).toEqual({
      firstSocketId: "socket-a",
      secondSocketId: "socket-c"
    });
    expect(matchmaker.waitingCount).toBe(1);
    expect(matchmaker.has("socket-b")).toBe(true);
  });

  it("allows fallback rematch after cooldown expires", () => {
    let nowMs = 10_000;
    const matchmaker = new Matchmaker(() => nowMs);

    matchmaker.enqueue("socket-a", {
      avoidSocketId: "socket-b",
      avoidUntilMs: nowMs + 2_000
    });
    const blockedByAvoid = matchmaker.enqueue("socket-b");

    nowMs += 2_100;
    const pairAfterCooldown = matchmaker.enqueue("socket-c");

    expect(blockedByAvoid).toBeNull();
    expect(pairAfterCooldown).toEqual({
      firstSocketId: "socket-a",
      secondSocketId: "socket-b"
    });
    expect(matchmaker.waitingCount).toBe(1);
    expect(matchmaker.has("socket-c")).toBe(true);
  });

  it("can rematch after cooldown expires without new enqueue", () => {
    let nowMs = 10_000;
    const matchmaker = new Matchmaker(() => nowMs);

    matchmaker.enqueue("socket-a", {
      avoidSocketId: "socket-b",
      avoidUntilMs: nowMs + 2_000
    });
    const blockedByAvoid = matchmaker.enqueue("socket-b");

    nowMs += 2_100;
    const pairAfterCooldown = matchmaker.tryMatch();

    expect(blockedByAvoid).toBeNull();
    expect(pairAfterCooldown).toEqual({
      firstSocketId: "socket-a",
      secondSocketId: "socket-b"
    });
    expect(matchmaker.waitingCount).toBe(0);
  });
});
