import { describe, expect, it } from "vitest";
import { meshHealth } from "../src/harness/graphs.js";
import { wallWait } from "../src/harness/clock.js";

describe("S10 route by tenant / class / priority", () => {
  it("each class lands only on its matching edge", async () => {
    const world = meshHealth({ fanout: "first" });
    world.gen.write({ endpoint: "local", class: "audit" });
    world.gen.write({ endpoint: "target-a", tenant: "alpha", class: "command" });
    world.gen.write({ endpoint: "target-b", tenant: "beta", class: "command" });
    await wallWait(40);
    expect(world.local.captured).toHaveLength(1);
    expect(world.tunnelA.captured).toHaveLength(1);
    expect(world.tunnelB.captured).toHaveLength(1);
    expect(world.fail.captured).toHaveLength(0);
    expect(world.metrics.edge("classify-local").filterCount).toBeGreaterThan(0);
  });
});
