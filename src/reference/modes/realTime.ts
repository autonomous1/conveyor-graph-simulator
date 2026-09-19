/** Isolated wall-clock pacing. The only setTimeout in src/reference. */

export function sleepMs(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function paceTick(startedAt: number, dtMs: number): Promise<void> {
  const deadline = startedAt + dtMs;
  const now = Date.now();
  if (now < deadline) await sleepMs(deadline - now);
}
