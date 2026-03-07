export interface MatchPair {
  firstSocketId: string;
  secondSocketId: string;
}

export class Matchmaker {
  private queue: string[] = [];

  get waitingCount(): number {
    return this.queue.length;
  }

  enqueue(socketId: string): MatchPair | null {
    if (this.queue.includes(socketId)) {
      return null;
    }

    this.queue.push(socketId);
    if (this.queue.length < 2) {
      return null;
    }

    const firstSocketId = this.queue.shift();
    const secondSocketId = this.queue.shift();

    if (!firstSocketId || !secondSocketId) {
      return null;
    }

    return {
      firstSocketId,
      secondSocketId
    };
  }

  has(socketId: string): boolean {
    return this.queue.includes(socketId);
  }

  remove(socketId: string): void {
    this.queue = this.queue.filter((queuedSocketId) => queuedSocketId !== socketId);
  }
}
