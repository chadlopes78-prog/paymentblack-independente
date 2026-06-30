import { useEffect, useRef } from "react";

// Polls the server for a new deploy by checking the ETag/Last-Modified of the
// root HTML. When a change is detected the page reloads automatically.
// Only runs in the browser, never on the server.

const INTERVAL_MS = 60_000; // check every 60s

async function fetchEtag(): Promise<string | null> {
  try {
    const res = await fetch("/", {
      method: "HEAD",
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    return res.headers.get("etag") || res.headers.get("last-modified") || String(res.headers.get("x-nf-request-id"));
  } catch {
    return null;
  }
}

export function useVersionCheck() {
  const baseline = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Capture current version on mount
    fetchEtag().then(tag => { baseline.current = tag; });

    const id = setInterval(async () => {
      const current = await fetchEtag();
      if (!current || !baseline.current) return;
      if (current !== baseline.current) {
        // New deploy detected — reload to get the latest version
        window.location.reload();
      }
    }, INTERVAL_MS);

    return () => clearInterval(id);
  }, []);
}
