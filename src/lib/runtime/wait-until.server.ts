import { AsyncLocalStorage } from "node:async_hooks";

type RuntimeContext = {
  waitUntil?: (promise: Promise<unknown>) => void;
};

const runtimeContext = new AsyncLocalStorage<RuntimeContext | null>();

export function runWithRuntimeContext<T>(ctx: unknown, callback: () => T): T {
  const candidate = ctx && typeof ctx === "object" ? (ctx as RuntimeContext) : null;
  return runtimeContext.run(candidate, callback);
}

export function waitUntil(promise: Promise<unknown>): boolean {
  const ctx = runtimeContext.getStore();
  if (typeof ctx?.waitUntil !== "function") return false;

  ctx.waitUntil(
    promise.catch((error) => {
      console.error("[runtime] waitUntil task failed", error);
    }),
  );
  return true;
}