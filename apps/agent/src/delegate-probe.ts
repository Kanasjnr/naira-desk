import { readFile } from "node:fs/promises";
import {
  assertCeloMainnet,
  createCeloPublicClient,
  createKeyFile,
  createTaggedWalletClient,
  REACTOR,
  readKeyFile,
  SWAP_ROUTER,
} from "@naira-desk/chain";
import { briefError, CELO_CHAIN_ID, CNGN, dataFile, USDT } from "@naira-desk/shared";
import {
  type Abi,
  type Address,
  concat,
  encodeDeployData,
  formatEther,
  getAddress,
  type Hex,
  hashMessage,
  http,
  isAddress,
  parseEther,
} from "viem";
import { rpcUrl } from "./env.ts";
import { cancelQuote, InsufficientFunds, requestQuote } from "./rfq.ts";
import { takerControl, walletProof } from "./taker.ts";

// Checks Textile accepts a wallet that has delegated to the AgentDelegate as a taker, using a
// throwaway wallet that holds no USD₮: Textile checks the proof before the funds, so
// insufficient_funds means the proof passed.

function stop(message: string): never {
  console.error(message);
  process.exit(1);
}

const option = (name: string) => {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
};

const keyFile = dataFile("probe.key");
const key = await readKeyFile(keyFile).catch(async () => {
  await createKeyFile(keyFile);
  return readKeyFile(keyFile);
});

const client = createCeloPublicClient(http(rpcUrl));
await assertCeloMainnet(client);
const wallet = createTaggedWalletClient(key, http(rpcUrl));
const probe = wallet.account.address;

const balance = await client.getBalance({ address: probe });
console.log(`probe    ${probe}, ${formatEther(balance)} CELO`);
if (balance < parseEther("0.03")) stop(`send 0.05 CELO to ${probe}, then run this again`);

async function ask(label: string) {
  const proof = await walletProof(wallet);
  try {
    const quote = await requestQuote(
      { sellToken: USDT, buyToken: CNGN, sellAmount: 1_000_000n, taker: probe },
      proof,
    );
    if (quote.status === "quoted") await cancelQuote(quote.rfqId, quote.claimToken);
    console.log(`${label}: accepted (${quote.status})`);
    return true;
  } catch (error) {
    if (error instanceof InsufficientFunds) {
      console.log(`${label}: accepted (insufficient_funds, as expected with no USD₮)`);
      return true;
    }
    console.log(`${label}: refused, ${briefError(error)}`);
    return false;
  }
}

const delegated = (code: Hex | undefined, delegate: Address) =>
  code?.toLowerCase() === concat(["0xef0100", delegate]).toLowerCase();

const passedPlain = (await client.getCode({ address: probe })) ? true : await ask("plain wallet");

let delegate = option("--delegate") as Address | undefined;
if (delegate && !isAddress(delegate)) stop(`--delegate ${delegate} isn't an address`);
if (!delegate) {
  // `pnpm delegate:probe` runs `forge build` in packages/contracts first.
  const artifact = new URL(
    "../../../packages/contracts/out/AgentDelegate.sol/AgentDelegate.json",
    import.meta.url,
  );
  const { abi, bytecode } = JSON.parse(await readFile(artifact, "utf8")) as {
    abi: Abi;
    bytecode: { object: Hex };
  };
  const data = encodeDeployData({
    abi,
    bytecode: bytecode.object,
    args: [REACTOR, USDT, SWAP_ROUTER],
  });
  const hash = await wallet.sendTransaction({ data });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) stop(`deploy ${hash} failed`);
  delegate = getAddress(receipt.contractAddress);
  console.log(`delegate ${delegate} https://celoscan.io/tx/${hash}`);
}

if (!delegated(await client.getCode({ address: probe }), delegate)) {
  // The wallet sends its own delegation, so the authorization is for the nonce after this one.
  const nonce = await client.getTransactionCount({ address: probe, blockTag: "pending" });
  const authorization = await wallet.signAuthorization({
    contractAddress: delegate,
    chainId: CELO_CHAIN_ID,
    nonce: nonce + 1,
  });
  const hash = await wallet.sendTransaction({
    to: probe,
    nonce,
    authorizationList: [authorization],
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") stop(`delegation ${hash} failed`);
  console.log(`delegated https://celoscan.io/tx/${hash}`);
}
if (!delegated(await client.getCode({ address: probe }), delegate)) {
  stop(`${probe} doesn't point at ${delegate} yet`);
}

const proof = await walletProof(wallet);
const vouched = await client.readContract({
  address: probe,
  abi: [
    {
      type: "function",
      name: "isValidSignature",
      stateMutability: "view",
      inputs: [
        { name: "hash", type: "bytes32" },
        { name: "signature", type: "bytes" },
      ],
      outputs: [{ type: "bytes4" }],
    },
  ],
  functionName: "isValidSignature",
  args: [hashMessage(takerControl(probe, proof.nonce, proof.issuedAt)), proof.signature],
});
console.log(
  `EIP-1271 ${vouched === "0x1626ba7e" ? "vouches for the wallet's own proof" : vouched}`,
);

const passedDelegated = await ask("delegated wallet");
console.log(
  passedPlain && passedDelegated
    ? `Textile takes a delegated wallet: the agent can delegate to ${delegate}`
    : "Textile refused: keep the Taker",
);
