import { access } from "node:fs/promises";
import { x402 } from "@celo/buy-core";
import {
  assertCeloMainnet,
  createCeloPublicClient,
  createKeyFile,
  createTaggedWalletClient,
  readKeyFile,
  tokenBalance,
} from "@naira-desk/chain";
import { dataFile, USDT } from "@naira-desk/shared";
import { formatUnits, http } from "viem";
import { rpcUrl } from "./env.ts";

// A buyer separate from the agent, so a sale is a real payment between two wallets.
const keyFile = process.env.BUYER_KEY_FILE || dataFile("buyer.key");
const url = process.argv[2] || process.env.API_URL || "http://127.0.0.1:8788/v1/naira";
const PRICE = 5_000n;

function stop(message: string): never {
  console.error(message);
  process.exit(1);
}

const exists = await access(keyFile).then(
  () => true,
  () => false,
);
if (!exists) {
  const address = await createKeyFile(keyFile);
  console.log(`created a demo buyer at ${address}`);
  console.log(
    "send it a few cents of USDT (no CELO needed: the agent pays the gas), then run this again",
  );
  process.exit(0);
}

const client = createCeloPublicClient(http(rpcUrl));
await assertCeloMainnet(client);
const { account } = createTaggedWalletClient(await readKeyFile(keyFile), http(rpcUrl));
const readBalance = tokenBalance(client);
const held = await readBalance(USDT, account.address);
console.log(`buyer ${account.address} holds $${formatUnits(held, 6)} USDT`);
if (held < PRICE) stop(`it needs at least $${formatUnits(PRICE, 6)} USDT for one quote`);

let txHash: string | undefined;
const response = await x402.payingFetch(
  {
    account,
    network: "celo",
    preferredToken: "USDT",
    readBalance: ({ token, owner }) => readBalance(token, owner),
  },
  url,
  {
    method: "GET",
    maxAmount: PRICE,
    onPayment: (paid) => {
      txHash = paid.txHash;
    },
  },
);

const body = await response.json().catch(() => undefined);
if (!response.ok) stop(`${url}: ${response.status} ${JSON.stringify(body)}`);
console.log(JSON.stringify(body, null, 2));
console.log(
  txHash ? `paid $0.005: https://celoscan.io/tx/${txHash}` : "paid, but no receipt came back",
);
