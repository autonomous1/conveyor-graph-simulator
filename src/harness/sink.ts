import type { StreamAgent } from "conveyor-graph";
import { wallWait } from "./clock.js";

export class StallableSink {
  readonly captured: unknown[] = [];
  readonly rejected: unknown[] = [];
  delayMs = 0;
  stalled = false;
  rejectRate = 0;
  rejectFn: ((payload: unknown) => boolean) | null = null;
  private resume!: () => void;
  private gate = Promise.resolve();

  stall(): void {
    this.stalled = true;
    this.gate = new Promise((resolve) => {
      this.resume = resolve;
    });
  }

  lift(): void {
    this.stalled = false;
    this.resume?.();
    this.gate = Promise.resolve();
  }

  handler = async (agent: StreamAgent): Promise<unknown> => {
    if (this.stalled) await this.gate;
    if (this.delayMs > 0) await wallWait(this.delayMs);
    const reject =
      (this.rejectFn ? this.rejectFn(agent.payload) : false) ||
      (this.rejectRate > 0 && Math.random() < this.rejectRate);
    if (reject) {
      this.rejected.push(agent.payload);
      throw new Error("sink rejected");
    }
    this.captured.push(agent.payload);
    return agent.payload;
  };
}

export class FakeTunnel {
  delayMs: number;
  hung = false;

  constructor(delayMs = 1) {
    this.delayMs = delayMs;
  }

  hang(): void {
    this.hung = true;
  }

  handler = async (agent: StreamAgent): Promise<unknown> => {
    if (this.hung) await new Promise(() => undefined);
    if (this.delayMs > 0) await wallWait(this.delayMs);
    return agent.payload;
  };
}
