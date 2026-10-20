import {
  AGENT_ID,
  assertCeloMainnet,
  createCeloPublicClient,
  operatorVaultAbi,
  VAULT,
} from "@naira-desk/chain";
import { formatUnits, http, isAddressEqual } from "viem";
import { rpcUrl } from "./env.ts";

const client = createCeloPublicClient(http(rpcUrl));
await assertCeloMainnet(client);

const view = <const F extends string>(functionName: F) =>
  ({ address: VAULT, abi: operatorVaultAbi, functionName }) as const;
const [
  owner,
  strategySigner,
  riskSigner,
  guardian,
  feeRecipient,
  paused,
  closeOnly,
  tradingEpoch,
  shares,
  freeSettlement,
  freeCorridor,
  liquidSettlement,
  quotableSettlement,
  quotableCorridor,
  pendingSettlement,
  pendingCorridor,
] = await client.multicall({
  contracts: [
    view("operatorAdmin"),
    view("strategySigner"),
    view("riskSigner"),
    view("guardian"),
    view("feeRecipient"),
    view("paused"),
    view("closeOnly"),
    view("tradingEpoch"),
    view("totalSupply"),
    view("freeSettlement"),
    view("freeCorridor"),
    view("liquidSettlement"),
    view("quotableSettlement"),
    view("quotableCorridor"),
    view("pendingSettlement"),
    view("pendingCorridor"),
  ],
  allowFailure: false,
});
const amount = (value: bigint) => formatUnits(value, 6);
const signerNote = isAddressEqual(strategySigner, owner)
  ? "the agent wallet, a placeholder until Stitch's key takes over"
  : "Stitch's bot key";

console.log(`Naira Desk USDT/cNGN vault ${VAULT}`);
console.log(`owner            ${owner} (agent #${AGENT_ID})`);
console.log(`strategy signer  ${strategySigner} (${signerNote})`);
console.log(`risk signer      ${riskSigner} (Textile Warp)`);
console.log(`guardian         ${guardian} (Textile)`);
console.log(`fee recipient    ${feeRecipient}`);
console.log(
  `state            ${paused ? "PAUSED" : "live"}${closeOnly ? ", close-only" : ""}, trading epoch ${tradingEpoch}`,
);
console.log(`shares           ${amount(shares)}`);
console.log(
  `USDT             free ${amount(freeSettlement)}, liquid ${amount(liquidSettlement)}, quotable ${amount(quotableSettlement)}, pending deposits ${amount(pendingSettlement)}`,
);
console.log(
  `cNGN             free ${amount(freeCorridor)}, quotable ${amount(quotableCorridor)}, pending deposits ${amount(pendingCorridor)}`,
);
if (quotableSettlement === 0n && quotableCorridor === 0n) {
  console.log("nothing to quote yet: the vault needs deposits before Stitch can trade");
}
