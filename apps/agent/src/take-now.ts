import {
  assertCeloMainnet,
  createCeloPublicClient,
  createTaggedWalletClient,
  readKeyFile,
  TAKER,
  takerAbi,
} from "@naira-desk/chain";
import { briefError, USDT } from "@naira-desk/shared";
import { erc20Abi, formatEther, formatUnits, http, parseEventLogs, parseUnits } from "viem";
import { files, rpcUrl } from "./env.ts";
import { bestGap, type Gap, gasInUsdt, ladderFor, MARKETS } from "./gaps.ts";
import { cancelQuote, reportFill, requestQuote, rfqLadders } from "./rfq.ts";
import { poolQuoter, quoteProblem, takerProof } from "./taker.ts";

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

const quote = await requestQuote(
  { sellToken: USDT, buyToken: best.market.token, sellAmount: best.spend, taker: TAKER },
  await takerProof(client, wallet),
);
const problem = quoteProblem(quote, float);
if (problem || quote.status !== "quoted") {
  if (quote.status === "quoted") await cancelQuote(quote.rfqId, quote.claimToken).catch(() => {});
  stop(problem ?? "no quote");
}

// The take has to at least pay for its own gas, or it reverts.
const args = [quote.transactions.swap.data, best.market.token, best.market.fee, gas] as const;
try {
  const { result } = await client.simulateContract({
    address: TAKER,
    abi: takerAbi,
    functionName: "take",
    args,
    account: wallet.account.address,
  });
  console.log(
    `firm quote: pay ${usd(BigInt(quote.quote.takerPays))}, simulated profit ${usd(result)}`,
  );
} catch (error) {
  await cancelQuote(quote.rfqId, quote.claimToken).catch(() => {});
  stop(`the firm quote doesn't pay: ${briefError(error)}`);
}

const hash = await wallet.writeContract({
  address: TAKER,
  abi: takerAbi,
  functionName: "take",
  args,
});
const receipt = await client.waitForTransactionReceipt({ hash });
console.log(`https://celoscan.io/tx/${hash}`);
if (receipt.status !== "success") stop("the take reverted");
await reportFill(quote.rfqId, quote.claimToken, hash).catch((error) =>
  console.log(`couldn't report the fill to Textile: ${briefError(error)}`),
);

const [took] = parseEventLogs({ abi: takerAbi, eventName: "Took", logs: receipt.logs });
if (took) {
  const { spent, received } = took.args;
  console.log(
    `paid ${usd(spent)}, the pool paid ${usd(received)}: ${usd(received - spent)}, gas ${formatEther(receipt.gasUsed * receipt.effectiveGasPrice)} CELO`,
  );
}
