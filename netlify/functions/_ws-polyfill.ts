/**
 * Netlify Functions run on Node 20, which lacks a native global WebSocket.
 * @supabase/supabase-js's realtime-js throws at client construction time
 * without one. Call ensureWebSocket() before any createClient() — we
 * don't use realtime channels in these serverless functions anyway.
 *
 * Exported as a function (not a bare side-effect import) because this
 * package.json declares "sideEffects": false, which would let bundlers
 * tree-shake a plain `import "./_ws-polyfill"` away entirely.
 */
import WS from "ws";

export function ensureWebSocket() {
  if (!(globalThis as any).WebSocket) {
    (globalThis as any).WebSocket = WS;
  }
}
