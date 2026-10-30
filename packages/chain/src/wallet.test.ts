import { toDataSuffix, toRoleDataSuffix } from "@celo/attribution-tags";
import { ATTRIBUTION_CODE } from "@naira-desk/shared";
import {
  type Address,
  custom,
  encodeFunctionData,
  erc20Abi,
  type Hash,
  type Hex,
  keccak256,
  parseTransaction,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { createCeloPublicClient } from "./public.ts";
import {
  createTaggedWalletClient,
  hasOurTag,
  isTxTagged,
  isUntaggedError,
  requireTagOnSign,
} from "./wallet.ts";

const usdt: Address = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e";
const recipient: Address = "0x000000000000000000000000000000000000dEaD";
const privateKey = generatePrivateKey();
const fees = { gas: 100_000n, maxFeePerGas: 10n, maxPriorityFeePerGas: 1n };
const suffix = toDataSuffix(ATTRIBUTION_CODE);
const transfer = encodeFunctionData({
  abi: erc20Abi,
  functionName: "transfer",
  args: [recipient, 1n],
});

function setup() {
  const sent: Hex[] = [];
  const transport = custom({
    async request({ method, params }: { method: string; params?: unknown }) {
      if (method === "eth_chainId") return "0xa4ec";
      if (method === "eth_getTransactionCount") return "0x0";
      if (method === "eth_sendRawTransaction") {
        const [raw] = params as [Hex];
        sent.push(raw);
        return keccak256(raw);
      }
      throw new Error(`unexpected rpc call: ${method}`);
    },
  });
  const sentData = () => {
    expect(sent).toHaveLength(1);
    return parseTransaction(sent[0] as Hex).data;
  };
  return { wallet: createTaggedWalletClient(privateKey, transport), sent, sentData };
}

describe("createTaggedWalletClient", () => {
  it("tags sendTransaction", async () => {
    const { wallet, sentData } = setup();
    await wallet.sendTransaction({ to: usdt, data: transfer, ...fees });
    expect(sentData()).toBe(`${transfer}${suffix.slice(2)}`);
  });

  it("tags writeContract once", async () => {
    const { wallet, sentData } = setup();
    await wallet.writeContract({
      address: usdt,
      abi: erc20Abi,
      functionName: "approve",
      args: [recipient, 1n],
      ...fees,
    });
    const data = sentData();
    expect(data?.endsWith(suffix.slice(2))).toBe(true);
    expect(data?.split(suffix.slice(2))).toHaveLength(2);
  });

  it("tags a plain value transfer", async () => {
    const { wallet, sentData } = setup();
    await wallet.sendTransaction({ to: recipient, value: 1n, ...fees });
    expect(sentData()).toBe(suffix);
  });

  it("refuses calldata that credits another app", async () => {
    const { wallet, sent } = setup();
    const theirs = toRoleDataSuffix({ app: "someone_else", service: ATTRIBUTION_CODE });
    const error = await wallet
      .sendTransaction({ to: usdt, data: `${transfer}${theirs.slice(2)}`, ...fees })
      .catch((e: unknown) => e);
    expect(isUntaggedError(error)).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it("hands out nonces from one queue, so concurrent sends don't collide", () => {
    const { account } = createTaggedWalletClient(
      generatePrivateKey(),
      custom({ request: async () => null }),
    );
    expect(account.nonceManager).toBeDefined();
  });

  it("tags a delegation the wallet sends for itself", async () => {
    const { wallet, sent } = setup();
    const self = wallet.account.address;
    const authorization = await wallet.signAuthorization({
      contractAddress: usdt,
      chainId: 42220,
      nonce: 1,
    });
    await wallet.sendTransaction({
      to: self,
      nonce: 0,
      authorizationList: [authorization],
      ...fees,
    });

    const tx = parseTransaction(sent[0] as Hex);
    expect(tx.type).toBe("eip7702");
    expect(tx.data).toBe(suffix);
    expect(tx.authorizationList?.[0]?.address).toBe(usdt.toLowerCase());
    expect(tx.authorizationList?.[0]?.nonce).toBe(1);
  });

  it("only exposes methods that tag", () => {
    const { wallet } = setup();
    // @ts-expect-error not part of the tagged wallet
    expect(wallet.deployContract).toBeUndefined();
    // @ts-expect-error not part of the tagged wallet
    expect(wallet.sendRawTransaction).toBeUndefined();
  });
});

describe("hasOurTag", () => {
  it("accepts our code as the app in a role tag", () => {
    const ours = toRoleDataSuffix({ app: ATTRIBUTION_CODE, wallet: "some_wallet" });
    expect(hasOurTag(`${transfer}${ours.slice(2)}`)).toBe(true);
  });
});

describe("requireTagOnSign", () => {
  const signer = requireTagOnSign(privateKeyToAccount(privateKey));
  const tx = { chainId: 42220, nonce: 0, to: recipient, ...fees };

  it("signs tagged transactions", async () => {
    const data: Hex = `${transfer}${suffix.slice(2)}`;
    await expect(signer.signTransaction({ ...tx, data })).resolves.toMatch(/^0x02/);
  });

  it("refuses untagged ones", async () => {
    const error = await signer.signTransaction({ ...tx, data: transfer }).catch((e: unknown) => e);
    expect(isUntaggedError(error)).toBe(true);
  });
});

describe("isTxTagged", () => {
  const tagged: Hash = `0x${"aa".repeat(32)}`;
  const untagged: Hash = `0x${"bb".repeat(32)}`;
  const mined: Record<Hash, Hex> = {
    [tagged]: `${transfer}${suffix.slice(2)}`,
    [untagged]: transfer,
  };
  const client = createCeloPublicClient(
    custom({
      async request({ method, params }: { method: string; params?: unknown }) {
        if (method !== "eth_getTransactionByHash")
          throw new Error(`unexpected rpc call: ${method}`);
        const [hash] = params as [Hash];
        const input = mined[hash];
        if (!input) return null;
        return {
          hash,
          input,
          blockHash: `0x${"11".repeat(32)}`,
          blockNumber: "0x1",
          transactionIndex: "0x0",
          from: recipient,
          to: usdt,
          nonce: "0x0",
          value: "0x0",
          gas: "0x5208",
          maxFeePerGas: "0x1",
          maxPriorityFeePerGas: "0x1",
          type: "0x2",
          chainId: "0xa4ec",
          v: "0x0",
          r: "0x1",
          s: "0x1",
        };
      },
    }),
  );

  it("reads the tag from a mined transaction", async () => {
    expect(await isTxTagged(client, tagged)).toBe(true);
    expect(await isTxTagged(client, untagged)).toBe(false);
  });

  it("throws for an unknown hash instead of saying untagged", async () => {
    await expect(isTxTagged(client, `0x${"cc".repeat(32)}`)).rejects.toThrow();
  });
});
