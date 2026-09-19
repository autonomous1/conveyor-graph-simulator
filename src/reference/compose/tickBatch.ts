export function tickBatch<T>(size: number): {
  push(tick: bigint, item: T): T[];
  flush(): T[];
} {
  if (!Number.isInteger(size) || size < 1) throw new RangeError("tickBatch size must be an integer >= 1");
  let current: bigint | null = null;
  let buf: T[] = [];
  return {
    push(tick: bigint, item: T): T[] {
      if (current !== null && tick !== current) {
        const out = buf;
        buf = [item];
        current = tick;
        return out;
      }
      current = tick;
      buf.push(item);
      if (buf.length >= size) {
        const out = buf;
        buf = [];
        return out;
      }
      return [];
    },
    flush(): T[] {
      const out = buf;
      buf = [];
      current = null;
      return out;
    },
  };
}
