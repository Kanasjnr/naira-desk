import { tokenBySymbol } from "@celo/buy-core";
import { type createTaggedWalletClient, eip3009Abi } from "@naira-desk/chain";
import { CELO_CHAIN_ID } from "@naira-desk/shared";
import {
  type Address,
  type Hash,
  type Hex,
  isAddressEqual,
  type PublicClient,
  parseSignature,
  recoverTypedDataAddress,
} from "viem";

export type Authorization = {
  from: Address;
  to: Address;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: Hex;
};

type Token = { symbol: string; asset: Address; name: string; version: string };
type Sale = { txHash: Hash; payer: Address; asset: Address; amount: string };
export type Charge = { ok: true; sale: Sale } | { ok: false; error: string };

const TOKENS: Token[] = ["USDC", "USDT", "USAT"].flatMap((symbol) => {
  const token = tokenBySymbol("celo", symbol);
  if (!token?.eip712Name || !token.eip712Version) return [];
  return [{ symbol, asset: token.address, name: token.eip712Name, version: token.eip712Version }];
});

const transferWithAuthorization = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" },
  { name: "validBefore", type: "uint256" },
  { name: "nonce", type: "bytes32" },
] as const;

// The payment header doesn't say which token it's for, so find the one whose
// EIP-712 domain recovers the payer.
async function signedToken(authorization: Authorization, signature: Hex) {
  for (const token of TOKENS) {
    const signer = await recoverTypedDataAddress({
      domain: {
        name: token.name,
        version: token.version,
        chainId: CELO_CHAIN_ID,
        verifyingContract: token.asset,
      },
      types: { TransferWithAuthorization: transferWithAuthorization },
      primaryType: "TransferWithAuthorization",
      message: {
        ...authorization,
        value: BigInt(authorization.value),
        validAfter: BigInt(authorization.validAfter),
        validBefore: BigInt(authorization.validBefore),
      },
      signature,
    }).catch(() => undefined);
    if (signer && isAddressEqual(signer, authorization.from)) return token;
  }
  return undefined;
}

type PaywallOptions = {
  price: bigint;
  payTo: Address;
  resource: string;
  description: string;
  chain: Pick<PublicClient, "readContract">;
  settle: (asset: Address, authorization: Authorization, signature: Hex) => Promise<Hash>;
  now?: () => number;
};

const SETTLE_MARGIN_S = 10;

// Takes x402 "exact" payments in any of the three dollar tokens and settles them
// itself, so every sale is a transaction from the agent's own wallet.
export function createPaywall({
  price,
  payTo,
  resource,
  description,
  chain,
  settle,
  now = Date.now,
}: PaywallOptions) {
  const claimed = new Set<string>();
  const accepts = TOKENS.map((token) => ({
    scheme: "exact",
    network: "celo",
    maxAmountRequired: price.toString(),
    resource,
    description,
    mimeType: "application/json",
    payTo,
    maxTimeoutSeconds: 120,
    asset: token.asset,
    extra: { name: token.name, version: token.version },
  }));

  async function charge(header: string): Promise<Charge> {
    let payment: {
      x402Version?: number;
      scheme?: string;
      network?: string;
      payload?: { authorization?: Authorization; signature?: Hex };
    };
    try {
      payment = JSON.parse(Buffer.from(header, "base64").toString());
    } catch {
      return { ok: false, error: "malformed payment header" };
    }
    const authorization = payment?.payload?.authorization;
    const signature = payment?.payload?.signature;
    if (payment.x402Version !== 1 || payment.scheme !== "exact" || payment.network !== "celo") {
      return { ok: false, error: "only x402 v1 exact payments on celo" };
    }
    if (!authorization || !signature) return { ok: false, error: "missing authorization" };

    const token = await signedToken(authorization, signature);
    if (!token) return { ok: false, error: "signature doesn't match an accepted token" };
    if (!isAddressEqual(authorization.to, payTo)) return { ok: false, error: "wrong recipient" };
    if (BigInt(authorization.value) !== price) return { ok: false, error: "wrong amount" };
    const seconds = now() / 1000;
    if (seconds <= Number(authorization.validAfter)) return { ok: false, error: "not valid yet" };
    if (seconds >= Number(authorization.validBefore) - SETTLE_MARGIN_S) {
      return { ok: false, error: "authorization expires too soon" };
    }

    const key = `${token.asset}:${authorization.from}:${authorization.nonce}`.toLowerCase();
    if (claimed.has(key)) return { ok: false, error: "payment already used" };
    claimed.add(key);
    try {
      const [used, balance] = await Promise.all([
        chain.readContract({
          address: token.asset,
          abi: eip3009Abi,
          functionName: "authorizationState",
          args: [authorization.from, authorization.nonce],
        }),
        chain.readContract({
          address: token.asset,
          abi: eip3009Abi,
          functionName: "balanceOf",
          args: [authorization.from],
        }),
      ]);
      if (used) return { ok: false, error: "payment already used" };
      if (balance < price) return { ok: false, error: `not enough ${token.symbol}` };
      const txHash = await settle(token.asset, authorization, signature);
      return {
        ok: true,
        sale: {
          txHash,
          payer: authorization.from,
          asset: token.asset,
          amount: authorization.value,
        },
      };
    } catch (error) {
      claimed.delete(key);
      return {
        ok: false,
        error: `settlement failed: ${error instanceof Error ? error.message : error}`,
      };
    }
  }

  return {
    accepts,
    challenge: (error = "") => ({ x402Version: 1, accepts, error }),
    charge,
  };
}

type Wallet = Pick<ReturnType<typeof createTaggedWalletClient>, "writeContract">;

export function authorizationSettler(
  wallet: Wallet,
  client: Pick<PublicClient, "waitForTransactionReceipt">,
) {
  return async (asset: Address, a: Authorization, signature: Hex) => {
    const { r, s, v, yParity } = parseSignature(signature);
    const hash = await wallet.writeContract({
      address: asset,
      abi: eip3009Abi,
      functionName: "transferWithAuthorization",
      args: [
        a.from,
        a.to,
        BigInt(a.value),
        BigInt(a.validAfter),
        BigInt(a.validBefore),
        a.nonce,
        Number(v ?? 27n + BigInt(yParity)),
        r,
        s,
      ],
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`settlement ${hash} reverted`);
    return hash;
  };
}
