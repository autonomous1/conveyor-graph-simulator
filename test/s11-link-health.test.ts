import { describe, expect, it } from "vitest";
import { meshHealth } from "../src/harness/graphs.js";
import { wallWait } from "../src/harness/clock.js";

describe("S11 route by simulated link health", () => {
  it("fanout first skips an unhealthy fail hop", async () => {
    const first = meshHealth({ fanout: "first", failHealthy: false });
    first.gen.write({ endpoint: "fail", link_hint: "down", tenant: "gamma" });
    first.gen.write({ endpoint: "target-a", tenant: "gamma" });
    await wallWait(40);
    expect(first.fail.captured).toHaveLength(0);
    expect(first.tunnelA.captured).toHaveLength(1);
  });

  it("fanout all still delivers clones to the fail hop", async () => {
    const all = meshHealth({ fanout: "all", failHealthy: false });
    all.gen.write({ endpoint: "fail", link_hint: "down", tenant: "gamma" });
    await wallWait(40);
    expect(all.fail.captured.length + all.metrics.edge("classify-fail").dropCount).toBeGreaterThan(0);
  });
});
