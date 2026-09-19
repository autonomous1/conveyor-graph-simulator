export function dropOldest<T>(queue: T[], capacity: number, item: T): T[] {
  const next = [...queue, item];
  while (next.length > capacity) next.shift();
  return next;
}

export function coalesce<T>(queue: T[], item: T, same: (a: T, b: T) => boolean): T[] {
  const idx = queue.findIndex((q) => same(q, item));
  if (idx >= 0) {
    const next = queue.slice();
    next[idx] = item;
    return next;
  }
  return [...queue, item];
}

export function rejectIfFull<T>(queue: T[], capacity: number, item: T): T[] {
  if (queue.length >= capacity) return queue;
  return [...queue, item];
}

export function deferTo<T>(item: T, dest: T[]): T[] {
  return [...dest, item];
}
