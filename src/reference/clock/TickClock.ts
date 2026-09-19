export interface TickClockOptions {
  dt?: number;
}

/**
 * Discrete simulation clock. Starts at tick 0n.
 * First executed tick is 1 after the first advance() at the end of that tick.
 */
export class TickClock {
  #tick = 0n;
  readonly dt: number;

  constructor(opts: TickClockOptions = {}) {
    this.dt = opts.dt ?? 1;
    if (!(this.dt > 0) || !Number.isFinite(this.dt)) {
      throw new RangeError("TickClock dt must be a positive finite number");
    }
  }

  get tick(): bigint {
    return this.#tick;
  }

  /** Simulated time: Number(tick) * dt. Not wall-clock. */
  get time(): number {
    return Number(this.#tick) * this.dt;
  }

  advance(): bigint {
    this.#tick += 1n;
    return this.#tick;
  }
}
