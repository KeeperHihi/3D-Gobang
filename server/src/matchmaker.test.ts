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
});
