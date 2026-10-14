import { assertCeloMainnet, createCeloPublicClient } from "@naira-desk/chain";
import { fairValue, type PricePoint, textileMid, uniswapTwap } from "@naira-desk/pricing";
import { http } from "viem";
import { rpcUrl } from "./env.ts";

const client = createCeloPublicClient(http(rpcUrl));
await assertCeloMainnet(client);
const results = await Promise.allSettled([textileMid(), uniswapTwap(client)]);

const points: PricePoint[] = [];
for (const result of results) {
  if (result.status === "fulfilled") {
    points.push(result.value);
    console.log(`${result.value.source.padEnd(8)} ${(1 / result.value.price).toFixed(2)} NGN/USDT`);
  } else {
    console.log(`failed   ${result.reason}`);
  }
}

const value = fairValue(points, Date.now());
console.log(
  value.ok ? `fair     ${(1 / value.price).toFixed(2)} NGN/USDT` : `no price: ${value.reason}`,
);
