import type { TickFailure } from "../types.js";

export class PhaseDidNotQuiesce extends Error {
  constructor(group: string, steps: number) {
    super(`${group} did not reach whenIdle after ${steps} turns`);
    this.name = "PhaseDidNotQuiesce";
  }
}

export class TickAbortedError extends Error {
  readonly failure: TickFailure;
  constructor(failure: TickFailure) {
    super(`tick ${failure.tick} failed in ${failure.group}: ${failure.message}`);
    this.name = "TickAbortedError";
    this.failure = failure;
  }
}
