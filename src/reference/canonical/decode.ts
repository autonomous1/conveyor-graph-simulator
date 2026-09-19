function revive(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(revive);
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec);
  if (keys.length === 1 && keys[0] === "$i" && typeof rec.$i === "string") {
    return BigInt(rec.$i);
  }
  if (keys.length === 1 && keys[0] === "$bytes" && typeof rec.$bytes === "string") {
    const hex = rec.$bytes;
    if (hex.length % 2 !== 0) throw new Error("invalid $bytes");
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }
  const next: Record<string, unknown> = {};
  for (const key of keys) next[key] = revive(rec[key]);
  return next;
}

export function canonicalParse(text: string): unknown {
  return revive(JSON.parse(text));
}
