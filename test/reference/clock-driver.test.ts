import { describe, expect, it } from "vitest";
import {
  TickClock,
  PhaseDriver,
  GROUP_ORDER,
  createRootRng,
  sha256CanonicalV1,
} from "../../src/reference/index.js";

describe("TickClock", () => {
  it("starts at 0n and ends at 1000n after 1000 advances", () => {
    const clock = new TickClock({ dt: 1 / 60 });
    expect(clock.tick).toBe(0n);
    expect(clock.time).toBe(0);
    const rng = createRootRng(7n);
    const hashes: string[] = [sha256CanonicalV1({ tick: clock.tick.toString(10), rng: rng.snapshot() })];
    for (let i = 0; i < 1000; i++) {
      clock.advance();
      hashes.push(sha256CanonicalV1({ tick: clock.tick.toString(10), rng: rng.snapshot() }));
    }
    expect(clock.tick).toBe(1000n);
    expect(Math.abs(clock.time - 1000 / 60) < 1e-9).toBe(true);
    const again = new TickClock({ dt: 1 / 60 });
    const rng2 = createRootRng(7n);
    const hashes2: string[] = [sha256CanonicalV1({ tick: again.tick.toString(10), rng: rng2.snapshot() })];
    for (let i = 0; i < 1000; i++) {
      again.advance();
      hashes2.push(sha256CanonicalV1({ tick: again.tick.toString(10), rng: rng2.snapshot() }));
    }
    expect(hashes2).toEqual(hashes);
    expect(hashes[0]).not.toBe(hashes[1]);
  });
});

describe("PhaseDriver", () => {
  it("runs groups in locked order", async () => {
    const seen: string[] = [];
    const driver = new PhaseDriver({
      observe: () => {
        seen.push("observe");
      },
      admit: () => {
        seen.push("admit");
      },
      sim: async () => {
        seen.push("sim");
      },
    });
    await driver.runTick();
    expect(seen).toEqual(["admit", "sim", "observe"]);
    expect(GROUP_ORDER[0]).toBe("admit");
    expect(GROUP_ORDER.at(-1)).toBe("advance");
  });
});
