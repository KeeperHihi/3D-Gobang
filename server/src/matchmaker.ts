export interface MatchPair {
  firstSocketId: string;
  secondSocketId: string;
}

interface MatchQueueEntry {
  socketId: string;
  queuedAtMs: number;
  avoidSocketId: string | null;
  avoidUntilMs: number | null;
}

export interface MatchEnqueueOptions {
  avoidSocketId?: string | null;
  avoidUntilMs?: number | null;
}

export class Matchmaker {
  private queue: MatchQueueEntry[] = [];

  constructor(private readonly now: () => number = () => Date.now()) {}

  get waitingCount(): number {
    return this.queue.length;
  }

  enqueue(socketId: string, options?: MatchEnqueueOptions): MatchPair | null {
    if (this.queue.some((entry) => entry.socketId === socketId)) {
      return null;
    }

    this.queue.push({
      socketId,
      queuedAtMs: this.now(),
      avoidSocketId: options?.avoidSocketId ?? null,
      avoidUntilMs: options?.avoidUntilMs ?? null
    });

    return this.pickPair();
  }

  tryMatch(): MatchPair | null {
    return this.pickPair();
  }

  private pickPair(): MatchPair | null {
    if (this.queue.length < 2) {
      return null;
    }

    const nowMs = this.now();
    for (let firstIndex = 0; firstIndex < this.queue.length - 1; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < this.queue.length; secondIndex += 1) {
        const firstEntry = this.queue[firstIndex];
        const secondEntry = this.queue[secondIndex];
        if (!firstEntry || !secondEntry) {
          continue;
        }
        if (!this.canPair(firstEntry, secondEntry, nowMs)) {
          continue;
        }

        this.queue.splice(secondIndex, 1);
        this.queue.splice(firstIndex, 1);
        return {
          firstSocketId: firstEntry.socketId,
          secondSocketId: secondEntry.socketId
        };
      }
    }

    return null;
  }

  private canPair(firstEntry: MatchQueueEntry, secondEntry: MatchQueueEntry, nowMs: number): boolean {
    return (
      !this.isAvoided(firstEntry, secondEntry.socketId, nowMs) &&
      !this.isAvoided(secondEntry, firstEntry.socketId, nowMs)
    );
  }

  private isAvoided(entry: MatchQueueEntry, opponentSocketId: string, nowMs: number): boolean {
    if (!entry.avoidSocketId || entry.avoidSocketId !== opponentSocketId) {
      return false;
    }

    if (entry.avoidUntilMs === null) {
      return true;
    }
    return nowMs < entry.avoidUntilMs;
  }

  has(socketId: string): boolean {
    return this.queue.some((entry) => entry.socketId === socketId);
  }

  remove(socketId: string): void {
    this.queue = this.queue.filter((entry) => entry.socketId !== socketId);
  }
}
