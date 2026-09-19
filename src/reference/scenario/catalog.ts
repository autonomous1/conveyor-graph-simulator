import type { StreamAgent } from "conveyor-graph";
import { defineScenario, type Scenario } from "./define.js";

export const stableCounter: Scenario = defineScenario({
  id: "stable-counter",
  seed: 11n,
  initialState: { count: 0 },
  ticks: 8,
  schedule: (rt, due) => {
    rt.scheduleExternal(`e${due}`, { add: 1 });
  },
});

export const delayedFeedback: Scenario = defineScenario({
  id: "delayed-feedback",
  seed: 3n,
  initialState: { count: 0 },
  ticks: 2,
  buildSim: (graph, ctx) => {
    graph.define("step", (agent: StreamAgent) => {
      const payload = agent.payload as { add?: number; hop?: number };
      const add = payload.add ?? 0;
      ctx.propose({ vertexId: "step", path: ["count"], value: add });
      if (payload.hop === 1) {
        ctx.enqueueMailbox({
          releaseTick: ctx.dueTick() + 1n,
          origin: "step",
          dest: "step",
          policy: "nextTick",
          payload: { add: 10, hop: 0 },
        });
      }
      return payload;
    });
  },
  schedule: (rt, due) => {
    if (due === 1n) rt.scheduleExternal("e0", { add: 1, hop: 1 });
  },
});

export const catalog = { stableCounter, delayedFeedback };
