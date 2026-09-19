import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sha256CanonicalV1 } from "../../src/reference/index.js";
import { KEY_ORDER_A, NESTED, BYTES, ASTRAL, FIXTURE_DOC } from "./fixtures.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("canonical-v1 child process", () => {
  it("matches in-process hashes", () => {
    const child = join(here, "canonical-child.ts");
    const register = join(here, "../register.mjs");
    const result = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "--import", register, child],
      { encoding: "utf8" },
    );
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || `child exit ${result.status}`);
    }
    expect(result.status).toBe(0);
    const remote = JSON.parse(result.stdout) as Record<string, string>;
    const local = {
      keys: sha256CanonicalV1(KEY_ORDER_A),
      nested: sha256CanonicalV1(NESTED),
      bytes: sha256CanonicalV1(BYTES),
      astral: sha256CanonicalV1(ASTRAL),
      envelope: sha256CanonicalV1(FIXTURE_DOC),
    };
    expect(remote).toEqual(local);
  });
});
