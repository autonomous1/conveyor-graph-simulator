import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../src/reference");

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (p.endsWith(".ts")) acc.push(p);
  }
  return acc;
}

describe("M0 modules forbid timers", () => {
  it("has no setTimeout, setInterval, or Date.now", () => {
    const files = walk(root);
    expect(files.length).toBeGreaterThan(5);
    const banned = /setTimeout|setInterval|Date\.now/;
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (file.endsWith(`${"modes"}/realTime.ts`)) continue;
      if (banned.test(text)) hits.push(file);
    }
    expect(hits).toEqual([]);
  });
});
