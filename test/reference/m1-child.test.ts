import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createReferenceRuntime } from "../../src/reference/index.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("M1 child process", () => {
  it("counter hashes match a child process", async () => {
    const rt = createReferenceRuntime({ seed: 11n, initialState: { count: 0 } });
    rt.start();
    for (let i = 0; i < 8; i++) {
      rt.scheduleExternal(`e${i}`, { add: 1 });
      await rt.runTick();
    }
    const result = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--import",
        join(here, "../register.mjs"),
        join(here, "m1-child.ts"),
      ],
      { encoding: "utf8" },
    );
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || `child exit ${result.status}`);
    }
    const remote = JSON.parse(result.stdout) as { hashes: string[]; count: number };
    expect(remote.hashes).toEqual(rt.hashes);
    expect(remote.count).toBe(8);
  });
});
