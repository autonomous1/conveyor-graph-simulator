import { describe, expect, it } from "vitest";
import { linearRequired } from "../src/harness/graphs.js";
import { wallWait } from "../src/harness/clock.js";

describe("S08 force stop vs graceful stop", () => {
  it("graceful stop drains in-flight then refuses ingress", async () => {
    const world = linearRequired({ hopDelayMs: 20 });
    world.gen.write();
    world.gen.write();
    await world.graph.stop();
    expect(world.graph.status).toBe("stopped");
    expect(() => world.gen.write()).toThrow(/stopped|draining/);
  });

  it("force stop refuses later write and marks the graph stopped", async () => {
    const world = linearRequired({ capacity: 2, overflow: "block", hopDelayMs: 80 });
    world.sink.stall();
    for (let i = 0; i < 6; i++) world.gen.write();
    await wallWait(10);
    await world.graph.stop({ force: true });
    expect(world.graph.status).toBe("stopped");
    expect(() => world.session.write("gen", "x", {})).toThrow(/stopped|draining/);
  });
});
