export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  const obj = value as object;
  if (!Object.isFrozen(obj)) Object.freeze(obj);
  if (Array.isArray(obj)) {
    for (const item of obj) deepFreeze(item);
    return value;
  }
  for (const key of Object.keys(obj)) {
    deepFreeze((obj as Record<string, unknown>)[key]);
  }
  return value;
}
