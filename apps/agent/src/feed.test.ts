import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { FairValue } from "@naira-desk/pricing";
import { afterEach, describe, expect, it } from "vitest";
import { createFeedServer, FEED_PATH, feedResponse } from "./feed.ts";

const good: FairValue = { ok: true, price: 0.0007334, at: 1_760_000_000_999, sources: ["a", "b"] };

describe("feedResponse", () => {
  it("serves price and whole-second timestamp", () => {
    expect(feedResponse(good)).toEqual({
      status: 200,
      body: { price: 0.0007334, timestamp: 1_760_000_000 },
    });
  });

  it("returns 503 when there's no fair value", () => {
    expect(feedResponse({ ok: false, reason: "sources disagree" })).toEqual({
      status: 503,
      body: { error: "sources disagree" },
    });
  });
});

describe("createFeedServer", () => {
  const servers: Server[] = [];
  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map((server) => {
        server.closeAllConnections();
        return new Promise((resolve) => server.close(resolve));
      }),
    );
  });

  async function serve(value: FairValue) {
    const server = createFeedServer(() => value).listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise((resolve) => server.once("listening", resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it("answers on the feed path, with or without a query or trailing slash", async () => {
    const base = await serve(good);
    for (const path of [FEED_PATH, `${FEED_PATH}?t=1`, `${FEED_PATH}/`]) {
      const response = await fetch(`${base}${path}`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ price: 0.0007334, timestamp: 1_760_000_000 });
    }
  });

  it("answers HEAD without a body", async () => {
    const response = await fetch(`${await serve(good)}${FEED_PATH}`, { method: "HEAD" });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  it("404s everywhere else", async () => {
    const response = await fetch(`${await serve(good)}/`);
    expect(response.status).toBe(404);
  });
});
