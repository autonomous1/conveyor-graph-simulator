import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const runtimeSrc = pathToFileURL(join(here, "../../conveyor-graph/src/index.ts")).href;
const modelSrc = pathToFileURL(join(here, "../../conveyor-graph-model/src/index.ts")).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "conveyor-graph") {
    return { url: runtimeSrc, shortCircuit: true };
  }
  if (specifier === "conveyor-graph-model") {
    return { url: modelSrc, shortCircuit: true };
  }
  if (specifier === "vitest") {
    return { url: pathToFileURL(join(here, "vitest-shim.mjs")).href, shortCircuit: true };
  }
  if (specifier.endsWith(".js") && context.parentURL) {
    const candidate = new URL(specifier.replace(/\.js$/, ".ts"), context.parentURL);
    if (existsSync(fileURLToPath(candidate))) {
      return { url: candidate.href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
