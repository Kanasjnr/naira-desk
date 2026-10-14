import { createServer } from "node:http";
import type { FairValue } from "@naira-desk/pricing";

export const FEED_PATH = "/feed/cngn-usdt";

// Stitch expects { price, timestamp }: price in USDT per cNGN, timestamp in whole
// unix seconds. Anything but a 200 makes Stitch stop quoting.
export function feedResponse(value: FairValue) {
  if (!value.ok) return { status: 503, body: { error: value.reason } };
  return { status: 200, body: { price: value.price, timestamp: Math.floor(value.at / 1000) } };
}

export function createFeedServer(current: () => FairValue) {
  return createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname.replace(/\/$/, "");
    const isRead = req.method === "GET" || req.method === "HEAD";
    const { status, body } =
      isRead && path === FEED_PATH
        ? feedResponse(current())
        : { status: 404, body: { error: "not found" } };
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : JSON.stringify(body));
  });
}
