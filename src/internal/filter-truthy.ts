export type Falsey = "" | 0 | false | undefined | null;

export function filterTruthy<T>(items: (T | Falsey)[]): T[] {
  return items.filter(isTruthy);
}

export function isTruthy<T>(value: T | Falsey): value is T {
  return !!value;
}
