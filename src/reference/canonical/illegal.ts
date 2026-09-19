export class CanonicalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalError";
  }
}

export function assertLegalNumber(value: number): void {
  if (Object.is(value, -0)) throw new CanonicalError("canonical-v1 rejects -0");
  if (Number.isNaN(value)) throw new CanonicalError("canonical-v1 rejects NaN");
  if (value === Infinity || value === -Infinity) {
    throw new CanonicalError("canonical-v1 rejects ±Infinity");
  }
}

export function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
