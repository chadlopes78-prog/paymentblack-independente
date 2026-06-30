export class AsyncLocalStorage<T = unknown> {
  run<R>(_store: T, fn: (...args: unknown[]) => R): R { return fn(); }
  getStore(): T | undefined { return undefined; }
  enterWith(_store: T): void {}
  disable(): void {}
}
export class AsyncResource {
  static bind<F extends (...args: unknown[]) => unknown>(fn: F): F { return fn; }
}
