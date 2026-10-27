import { createServer, type ServerResponse } from "node:http";
import { TAKER, VAULT } from "@naira-desk/chain";
import type { Store } from "./store.ts";
import { fillView, navHistory, summarize, takerSummary, takeView } from "./summary.ts";

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  });
  res.end(JSON.stringify(body));
}

// Everything here is recomputed from the indexed chain rows on each request.
export function createIndexerApi({
  store,
  syncedAt,
}: {
  store: Store;
  syncedAt: () => number | null;
}) {
  return createServer((req, res) => {
    if (req.method !== "GET") return send(res, 405, { error: "GET only" });
    const path = new URL(req.url ?? "/", "http://localhost").pathname.replace(/\/$/, "");
    const cursor = store.cursor();

    if (path === "/api/summary") {
      return send(res, 200, {
        vault: VAULT,
        synced: { block: cursor === undefined ? null : Number(cursor), at: syncedAt() },
        ...summarize(store.events(), store.fills()),
      });
    }
    if (path === "/api/fills") return send(res, 200, store.fills().map(fillView).reverse());
    if (path === "/api/nav") return send(res, 200, navHistory(store.events()).points);
    if (path === "/api/taker") {
      const takes = store.takes();
      const synced = store.takerCursor();
      return send(res, 200, {
        taker: TAKER,
        synced: { block: synced === undefined ? null : Number(synced), at: syncedAt() },
        ...takerSummary(takes),
        takes: takes.map(takeView).reverse(),
      });
    }
    send(res, 404, { error: "not found" });
  });
}
