import util from 'util';

export function writeLog(msg: string, obj: unknown): void;
export function writeLog(obj: unknown): void;
export function writeLog(...args: unknown[]): void {
  console.log(...args.map((x) => (typeof x === 'string' ? x : logInspect(x))));
}

export function logInspect(obj: unknown): string {
  return util.inspect(obj, {
    compact: false,
    depth: null,
  });
}
