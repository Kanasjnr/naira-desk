import { createServer, type ServerResponse } from "node:http";
import type { Charge, createPaywall } from "./paywall.ts";
import type { NairaQuote } from "./quote.ts";

export const QUOTE_PATH = "/v1/naira";

type ApiOptions = {
  quote: () => NairaQuote | undefined;
  paywall: ReturnType<typeof createPaywall>;
  onSale?: (sale: Extract<Charge, { ok: true }>["sale"]) => void;
};

const base64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");

function send(res: ServerResponse, status: number, body: unknown, headers = {}) {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-expose-headers": "x-payment-response",
    ...headers,
  });
  res.end(JSON.stringify(body));
}

// The public, paid side of the agent. A request without a payment gets the 402 price;
// with one, the agent settles it onchain and answers with the current naira quote.
export function createApiServer({ quote, paywall, onSale }: ApiOptions) {
  return createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname.replace(/\/$/, "");
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "x-payment, content-type",
      });
      return res.end();
    }
    if (req.method !== "GET") return send(res, 405, { error: "GET only" });

    if (path === "") {
      return send(res, 200, {
        name: "Naira Desk",
        description:
          "The naira rate from an onchain market maker: onchain cNGN, the official and street rates it reads, and its risk call, with payment receipts.",
        endpoints: [
          { path: QUOTE_PATH, price: paywall.accepts[0]?.maxAmountRequired, x402: paywall.accepts },
        ],
      });
    }
    if (path !== QUOTE_PATH) return send(res, 404, { error: "not found" });

    // Never charge for an answer we can't give.
    if (!quote()) return send(res, 503, { error: "no trustworthy naira rate right now" });
    const header = req.headers["x-payment"];
    if (typeof header !== "string") return send(res, 402, paywall.challenge());

    const charge = await paywall.charge(header);
    if (!charge.ok) return send(res, 402, paywall.challenge(charge.error));
    onSale?.(charge.sale);
    send(res, 200, quote() ?? { error: "rate went stale while settling" }, {
      "x-payment-response": base64({
        success: true,
        transaction: charge.sale.txHash,
        network: "celo",
        payer: charge.sale.payer,
      }),
    });
  });
}
