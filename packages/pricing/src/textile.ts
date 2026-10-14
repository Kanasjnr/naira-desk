import { CELO_CHAIN_ID } from "@naira-desk/shared";
import type { PricePoint } from "./types.ts";

const PREVIEW_URL = "https://api.textilecredit.com/v2/rfq/preview";
const USDT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e";
const CNGN = "0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f";
const HUNDRED_USDT = "100000000";

type Preview = { data?: { status?: string; rateRay?: string; reason?: string } };

async function previewRate(fetchFn: typeof fetch, body: Record<string, unknown>) {
  const response = await fetchFn(PREVIEW_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chainId: CELO_CHAIN_ID, ...body }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`textile preview failed: ${response.status}`);
  const { data } = (await response.json()) as Preview;
  if (data?.status !== "preview" || !data.rateRay) {
    throw new Error(
      `textile has no quote: ${data?.reason ?? data?.status ?? "unexpected response"}`,
    );
  }
  // rateRay is USDT per cNGN in both directions, scaled by 1e27.
  return Number(data.rateRay) / 1e27;
}

// Midpoint of Textile's indicative rates for buying and selling $100 of cNGN on Celo.
export async function textileMid(fetchFn: typeof fetch = fetch): Promise<PricePoint> {
  const at = Date.now();
  const [buyRate, sellRate] = await Promise.all([
    previewRate(fetchFn, { sellToken: USDT, buyToken: CNGN, sellAmount: HUNDRED_USDT }),
    previewRate(fetchFn, { sellToken: CNGN, buyToken: USDT, buyAmount: HUNDRED_USDT }),
  ]);
  return { source: "textile", price: (buyRate + sellRate) / 2, at };
}
