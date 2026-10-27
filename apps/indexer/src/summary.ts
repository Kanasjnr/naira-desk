import { CNGN, OUR_WALLETS, WARS, WBRL } from "@naira-desk/shared";
import { type Address, formatEther, formatUnits, isAddressEqual, zeroAddress } from "viem";
import type { FillRow, TakeRow, VaultEvent } from "./store.ts";

const MARKETS: { name: string; token: Address; decimals: number }[] = [
  { name: "cNGN", token: CNGN, decimals: 6 },
  { name: "wBRL", token: WBRL, decimals: 18 },
  { name: "wARS", token: WARS, decimals: 18 },
];

// USDT, cNGN and vault shares all have 6 decimals.
const units = (value: bigint) => Number(formatUnits(value, 6));
const sum = (values: bigint[]) => values.reduce((total, value) => total + value, 0n);
const big = (event: VaultEvent, key: string) => BigInt(event.args[key] as string);

const isOurs = (...addresses: Address[]) =>
  addresses.some((address) => OUR_WALLETS.some((ours) => isAddressEqual(ours, address)));

export function fillView(fill: FillRow) {
  return {
    at: fill.at,
    block: fill.block,
    logIndex: fill.logIndex,
    tx: fill.tx,
    side: fill.side,
    usdt: units(fill.usdt),
    cngn: units(fill.cngn),
    ngnPerUsdt: fill.usdt ? Number(fill.cngn) / Number(fill.usdt) : null,
    filler: fill.filler,
    sender: fill.sender,
    ours: isOurs(fill.filler, fill.sender),
  };
}

// Share price each time the vault settled its NAV. Shares are counted from mints and burns
// up to that log, which in a settling transaction includes the epoch's own mint or burn.
export function navHistory(events: VaultEvent[]) {
  let supply = 0n;
  const points = [];
  for (const event of events) {
    if (event.name === "Transfer") {
      if (isAddressEqual(event.args.from as Address, zeroAddress)) supply += big(event, "value");
      if (isAddressEqual(event.args.to as Address, zeroAddress)) supply -= big(event, "value");
    }
    if (event.name === "NavSettled") {
      const nav = big(event, "nav");
      points.push({
        at: event.at,
        block: event.block,
        tx: event.tx,
        nav: units(nav),
        shares: units(supply),
        perShare: supply ? Number(nav) / Number(supply) : null,
      });
    }
  }
  return { points, shares: units(supply) };
}

export function takeView(take: TakeRow) {
  const market = MARKETS.find((m) => isAddressEqual(m.token, take.token));
  const spent = units(take.spent);
  return {
    at: take.at,
    block: take.block,
    logIndex: take.logIndex,
    tx: take.tx,
    market: market?.name ?? take.token,
    amount: market ? Number(formatUnits(take.amount, market.decimals)) : null,
    spent,
    received: units(take.received),
    profit: units(take.received - take.spent),
    gasCelo: Number(formatEther(take.gasPaid)),
  };
}

export function takerSummary(takes: TakeRow[]) {
  const total = (rows: TakeRow[]) => ({
    count: rows.length,
    volumeUsdt: units(sum(rows.map((take) => take.spent))),
    profitUsdt: units(sum(rows.map((take) => take.received - take.spent))),
    gasCelo: Number(formatEther(sum(rows.map((take) => take.gasPaid)))),
  });
  return {
    ...total(takes),
    lastAt: takes.at(-1)?.at ?? null,
    markets: Object.fromEntries(
      MARKETS.map(({ name, token }) => [
        name,
        total(takes.filter((take) => isAddressEqual(take.token, token))),
      ]),
    ),
  };
}

export function summarize(events: VaultEvent[], fills: FillRow[]) {
  const trades = fills.map(fillView);
  const independent = trades.filter((fill) => !fill.ours);
  const named = (name: string) => events.filter((event) => event.name === name);

  const requests = named("DepositRequest");
  const inCorridor = new Map(
    requests.map((event) => [event.args.requestId, event.args.inCorridor]),
  );
  const processed = named("DepositEpochProcessed");
  const deposited = (corridor: boolean) =>
    units(
      sum(
        processed
          .filter((event) => inCorridor.get(event.args.epochId) === corridor)
          .map((event) => big(event, "assets")),
      ),
    );
  const settled = named("RedeemEpochSettled");
  const depositors = new Set(requests.map((event) => (event.args.owner as string).toLowerCase()));
  const independentDepositors = new Set(
    requests
      .filter((event) => !isOurs(event.args.owner as Address, event.args.sender as Address))
      .map((event) => (event.args.owner as string).toLowerCase()),
  );

  const nav = navHistory(events);
  const pause = events.findLast((event) => event.name === "Paused" || event.name === "Unpaused");

  return {
    fills: {
      count: trades.length,
      independent: independent.length,
      volumeUsdt: trades.reduce((total, fill) => total + fill.usdt, 0),
      independentVolumeUsdt: independent.reduce((total, fill) => total + fill.usdt, 0),
      // By filler: takers sharing a router count once, so this can undercount, never overcount.
      takers: new Set(independent.map((fill) => fill.filler.toLowerCase())).size,
      lastAt: trades.at(-1)?.at ?? null,
    },
    lps: {
      depositors: depositors.size,
      independent: independentDepositors.size,
      depositedUsdt: deposited(false),
      depositedCngn: deposited(true),
      redeemedUsdt: units(sum(settled.map((event) => big(event, "settlementOut")))),
      redeemedCngn: units(sum(settled.map((event) => big(event, "corridorOut")))),
    },
    nav: { last: nav.points.at(-1) ?? null, shares: nav.shares },
    feeShares: units(sum(named("FeeAccrued").map((event) => big(event, "shares")))),
    paused: pause?.name === "Paused",
  };
}
