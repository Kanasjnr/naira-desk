import { REACTOR, reactorAbi } from "@naira-desk/chain";
import { CNGN, USDT } from "@naira-desk/shared";
import { type Address, erc20Abi, type Hex, isAddressEqual, type Log, parseEventLogs } from "viem";

export type Fill = {
  orderHash: Hex;
  logIndex: number;
  filler: Address;
  // The vault bought naira (paid USDT) or sold it (paid cNGN).
  side: "buy" | "sell";
  usdt: bigint;
  cngn: bigint;
};

const isPair = (token: Address) => isAddressEqual(token, USDT) || isAddressEqual(token, CNGN);

// The reactor pulls every order's input first, then pays each order's outputs and logs
// its Fill. So the vault's k-th outgoing transfer is the input of its k-th order, and what
// reached the vault since the previous Fill is that order's output.
export function fillsFromLogs(logs: Log[], vault: Address): Fill[] {
  const transfers = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs }).filter((log) =>
    isPair(log.address),
  );
  const inputs = transfers.filter((log) => isAddressEqual(log.args.from, vault));
  const fills = parseEventLogs({ abi: reactorAbi, eventName: "Fill", logs }).filter((log) =>
    isAddressEqual(log.address, REACTOR),
  );

  const out: Fill[] = [];
  let since = -1;
  for (const fill of fills) {
    const after = since;
    since = fill.logIndex;
    if (!isAddressEqual(fill.args.swapper, vault)) continue;

    const input = inputs[out.length];
    if (!input) throw new Error(`fill ${fill.args.orderHash} has no transfer out of the vault`);
    const received = transfers
      .filter(
        (log) =>
          log.logIndex > after &&
          log.logIndex < fill.logIndex &&
          isAddressEqual(log.args.to, vault) &&
          !isAddressEqual(log.address, input.address),
      )
      .reduce((sum, log) => sum + log.args.value, 0n);
    const paidUsdt = isAddressEqual(input.address, USDT);
    out.push({
      orderHash: fill.args.orderHash,
      logIndex: fill.logIndex,
      filler: fill.args.filler,
      side: paidUsdt ? "buy" : "sell",
      usdt: paidUsdt ? input.args.value : received,
      cngn: paidUsdt ? received : input.args.value,
    });
  }
  return out;
}
