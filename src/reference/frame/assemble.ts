import type { ObsCanonical, ObsFrame } from "./types.js";

export function assembleObsFrame(tick: string, canonical: ObsCanonical): ObsFrame {
  return { tick, canonical, incidental: {} };
}
