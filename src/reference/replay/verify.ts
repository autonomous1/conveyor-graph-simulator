import type { ArtifactDocument, ArtifactEvent } from "./artifact.js";

export interface VerifyReport {
  ok: boolean;
  lastMatchTick: string | null;
  firstDivergentTick: string | null;
  expectedHash?: string;
  actualHash?: string;
  eventsSinceLastMatch: ArtifactEvent[];
}

export function verifyReplay(recorded: ArtifactDocument, actualHashes: string[]): VerifyReport {
  const expected = recorded.checkpoints;
  let lastMatchTick: string | null = null;
  let lastMatchIndex = -1;
  const n = Math.min(expected.length, actualHashes.length);
  for (let i = 0; i < n; i++) {
    if (expected[i]!.hash !== actualHashes[i]) {
      const firstDivergentTick = expected[i]!.tick;
      return {
        ok: false,
        lastMatchTick,
        firstDivergentTick,
        expectedHash: expected[i]!.hash,
        actualHash: actualHashes[i],
        eventsSinceLastMatch: eventsBetween(recorded.events, lastMatchTick, firstDivergentTick),
      };
    }
    lastMatchTick = expected[i]!.tick;
    lastMatchIndex = i;
  }
  if (expected.length !== actualHashes.length) {
    const firstDivergentTick = expected[n]?.tick ?? String(actualHashes.length - 1);
    return {
      ok: false,
      lastMatchTick,
      firstDivergentTick,
      expectedHash: expected[n]?.hash,
      actualHash: actualHashes[n],
      eventsSinceLastMatch: eventsBetween(recorded.events, lastMatchTick, firstDivergentTick),
    };
  }
  return {
    ok: true,
    lastMatchTick: lastMatchIndex >= 0 ? expected[lastMatchIndex]!.tick : null,
    firstDivergentTick: null,
    eventsSinceLastMatch: [],
  };
}

function eventsBetween(events: ArtifactEvent[], lastMatch: string | null, firstDivergent: string): ArtifactEvent[] {
  const lo = lastMatch === null ? -1n : BigInt(lastMatch);
  const hi = BigInt(firstDivergent);
  return events.filter((e) => {
    const t = BigInt(e.tick);
    return t > lo && t <= hi;
  });
}
