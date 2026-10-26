import {
  assertCeloMainnet,
  createCeloPublicClient,
  createTaggedWalletClient,
  readKeyFile,
  TAKER,
} from "@naira-desk/chain";
import { briefError, USDT } from "@naira-desk/shared";
import { erc20Abi, formatEther, formatUnits, http, parseUnits } from "viem";
import { files, rpcUrl } from "./env.ts";
import { bestGap, type Gap, gasInUsdt, ladderFor, MARKETS } from "./gaps.ts";
import { rfqLadders } from "./rfq.ts";
import { poolQuoter, takeGap } from "./taker.ts";

function stop(message: string): never {
  console.error(message);
  process.exit(1);
}

const usd = (amount: bigint) =>
  amount < 0n ? `-$${formatUnits(-amount, 6)}` : `$${formatUnits(amount, 6)}`;
const option = (name: string) => {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
};

const dryRun = process.argv.includes("--dry-run");
const cap = option("--usd");

const client = createCeloPublicClient(http(rpcUrl));
await assertCeloMainnet(client);
const wallet = createTaggedWalletClient(await readKeyFile(files.key), http(rpcUrl));

const [float, ladders, fees] = await Promise.all([
  client.readContract({ address: USDT, abi: erc20Abi, functionName: "balanceOf", args: [TAKER] }),
  rfqLadders(),
  client.estimateFeesPerGas(),
]);
// A dry run can look at a budget the Taker doesn't hold yet.
const budget = cap === undefined ? float : parseUnits(cap, 6);
if (!dryRun && budget > float) stop(`the Taker holds ${usd(float)}, less than ${usd(budget)}`);
if (budget === 0n) {
  stop(`the Taker holds no USD₮: send some to ${TAKER}, or try --dry-run --usd 20`);
}
const gas = gasInUsdt(ladders, fees.maxFeePerGas);
console.log(`up to ${usd(budget)} per take, about ${usd(gas)} of gas each`);

const quoter = poolQuoter(client);
const gaps: Gap[] = [];
for (const market of MARKETS) {
  const ladder = ladderFor(ladders, USDT, market.token);
  const gap = ladder && (await bestGap(market, ladder, budget, quoter));
  if (!gap) {
    console.log(`${market.name}  no Textile quotes in this size`);
    continue;
  }
  if (gap.poolPays === 0n) {
    console.log(`${market.name}  the Uniswap pool can't take any right now`);
    continue;
  }
  console.log(
    `${market.name}  ${usd(gap.spend)} from Textile, the pool pays ${usd(gap.poolPays)}: ${usd(gap.profit)} before gas`,
  );
  gaps.push(gap);
}

const best = gaps.reduce<Gap | undefined>(
  (top, gap) => (gap.profit > gas && (!top || gap.profit > top.profit) ? gap : top),
  undefined,
);
if (!best) {
  console.log("no gap pays for its gas right now");
  process.exit(0);
}
console.log(`best: ${best.market.name}, ${usd(best.profit - gas)} after gas`);
if (dryRun) process.exit(0);

// The take has to at least pay for its own gas, or it reverts.
const took = await takeGap({ client, wallet }, best, float, gas).catch((error) =>
  stop(briefError(error)),
);
console.log(`https://celoscan.io/tx/${took.hash}`);
console.log(
  `paid ${usd(took.spent)}, the pool paid ${usd(took.received)}: ${usd(took.received - took.spent)}, gas ${formatEther(took.gasPaid)} CELO`,
);
