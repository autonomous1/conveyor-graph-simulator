/**
 * Controllable clock for scenario scheduling.
 * Vertex timeouts and EdgeStream blockedMs still use wall Date.now()
 * inside conveyor-graph; S-series that need those use wall waits.
 */
export class VirtualClock {
  private nowMs = 0;
  private readonly waiters: Array<{ at: number; resolve: () => void }> = [];

  now(): number {
    return this.nowMs;
  }

  async wait(ms: number): Promise<void> {
    const at = this.nowMs + ms;
    await new Promise<void>((resolve) => {
      this.waiters.push({ at, resolve });
    });
  }

  advance(ms: number): void {
    this.nowMs += ms;
    const due = this.waiters.filter((w) => w.at <= this.nowMs).sort((a, b) => a.at - b.at);
    this.waiters.splice(0, this.waiters.length, ...this.waiters.filter((w) => w.at > this.nowMs));
    for (const w of due) w.resolve();
  }
}

export function wallWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
