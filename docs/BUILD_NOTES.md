# How I built Naira Desk

The story behind the code: what I set out to build, what the market taught me, the decisions that shaped the desk, and the ideas I tried and dropped. The design itself is in [ARCHITECTURE.md](ARCHITECTURE.md).

## The idea

In Lagos, a bureau de change (BDC) does two things. It makes a market, quoting a buy and a sell price to anyone who walks in, and it takes a good price when another dealer offers one. Naira Desk is that BDC, run by an autonomous agent on Celo, trading cNGN, a naira stablecoin, and publishing every trade.

I built it on two rails:

- [Textile FX](https://app.textilecredit.com), an RFQ venue where makers quote firm prices and takers fill them onchain.
- [buy](https://usebuy.ai), so the agent can pay per call for the research it needs, and sell its own.

## How it came together

**I started as a maker.** The agent registered its ERC-8004 identity and deployed its own Textile Operator Vault for cNGN/USD₮, both from its own wallet. Textile's Stitch bot quotes the vault off the agent's price feed, and the agent pays through buy for the research that decides when the vault quotes, when it's careful and when it stops.

**Then I looked at who was actually trading.** The Uniswap cNGN pool values the naira about 0.9% higher than the off-chain market (Luno and Textile's makers). Every recent cNGN fill on Textile was a taker buying cNGN from a maker and, in effect, selling it to the pool. A maker that fills that flow loses the gap on every trade.

**So I pivoted the money side to taking.** I kept the vault, but priced it at the pool, so nobody can buy from it and sell to the pool at a profit and its LPs aren't the ones paying for the gap. And I built the other side of that trade: the Taker. When any Textile maker, on cNGN, wBRL, wARS or any pair with a Uniswap pool, quotes below the pool, the agent takes the quote and sells into Uniswap.

**Running it live changed the trader.** Textile's fund reservations, races for the same gap and gas costs each forced a fix (below). Then I moved everything onto free hosting so the desk runs without my laptop.

## Key decisions

**One transaction per trade.** Buying on Textile in one transaction and selling on Uniswap in the next leaves you holding the token whenever the second one fails or the pool moves in between. The Taker contract does both in one transaction and reverts unless it ends with more USD₮ than it started with. A trade makes money or doesn't happen; a lost race costs only gas.

**A contract that even the agent can't empty.** The agent's key lives on a server, so I assumed it could leak one day. The Taker lets that key trade and nothing else: withdrawals only ever pay my own wallet, and it refuses to vouch for USD₮ permits or transfer authorizations signed by the agent. A fork test proves a stolen agent key can't move the Taker's money.

**The vault's safety is in the contract, not my code.** Every vault fill needs two signatures, Stitch's and Textile's Warp co-signer, and the vault's policy checks caps, inventory and who may fill. The agent sits before all that: it sets the price Stitch quotes from, and it can halt quoting by making its price feed answer 503.

**Every transaction is tagged, by construction.** The agent's wallet client refuses to sign a transaction without the ERC-8021 tag `celo_1944046be211`. Stitch signs vault quotes with its own key, so the agent wallet only ever sends transactions I can tag.

**Research the agent pays for, and acts on.** The agent buys naira news, street-rate posts and an AI read of both through buy, on a schedule and whenever the market jumps. It compares the onchain rate with the official and parallel rates people quote, then decides whether the vault quotes normally, carefully, or not at all. Each decision is logged with its payment receipts, and each supplier gets a daily rating on their ERC-8004 identity.

**Sell what it learns.** The agent resells its view as an API: `GET /v1/naira` for $0.005 over x402, settled onchain by the agent itself.

**Tests replay real trades.** The Taker's tests fork Celo at the blocks of real Textile fills and replay them, including the failures: a pool that moved first, an expired quote, a quote already filled, the wrong token. Public RPCs don't reliably serve state that old, so the state the tests read is committed to the repo and CI runs offline from it.

## Lessons from running it live

**Textile holds a taker's funds for every live quote.** When the agent asks for a firm quote, Textile reserves that much of the Taker's USD₮ until the quote's deadline, even after the quote is filled or cancelled. A second gap a few seconds later then failed with `insufficient_funds`. So the trader now retries at the amount that's actually free ([#55](https://github.com/Kanasjnr/naira-desk/pull/55)), and doesn't back off when the only shortfall is its own last quote ([#57](https://github.com/Kanasjnr/naira-desk/pull/57)).

**Simulate before sending.** A firm quote can stop paying between the scan and the trade, when the pool moves or someone else gets there first. The agent simulates every take before sending it, and skips the ones that wouldn't make money. Skipped trades cost nothing.

**Cancel what you don't use, and keep nonces in order.** A quote that never lands is now cancelled so Textile releases the maker's liquidity sooner, and the agent's trades, reviews and API settlements share one nonce queue so they never collide ([#61](https://github.com/Kanasjnr/naira-desk/pull/61)).

**Gas decides which gaps are worth it.** Celo's base fee sits around 200 gwei, so each take must at least pay for its own gas, or the contract reverts. Gaps under that line are logged as seen but not taken.

## What I tried and dropped

**Splitting the float in two** ([#60](https://github.com/Kanasjnr/naira-desk/pull/60), reverted in [#65](https://github.com/Kanasjnr/naira-desk/pull/65)). The idea was to take two gaps at once with half the float each. In practice it didn't add trades: Textile's reservations block the second quote either way, and each half-size trade made half the profit against the same gas. So I went back to using the whole float per trade.

**Letting the agent wallet trade directly** ([#67](https://github.com/Kanasjnr/naira-desk/pull/67), reverted in [#69](https://github.com/Kanasjnr/naira-desk/pull/69)). With EIP-7702, live on Celo since its Isthmus upgrade, a normal wallet can run contract code. I built a delegate that would let the agent fill and sell from its own wallet, with no Taker in between. It passed 18 fork tests, static analysis with Slither and a security review. I dropped it anyway: once the money sits in the agent's own wallet, whoever holds the agent key can move it, and the Taker's lock is worth more than the convenience.

**A colourful dashboard.** The first redesign used several accent colours. I cut it to one accent in a terminal style, raised the font sizes, and put volume first, so the numbers people look for are the first thing they see.

## Running it for $0

The desk runs unattended on free tiers:

- **Northflank:** one container runs the agent and the indexer, with a volume for the key and logs. A second service runs Textile's Stitch image, quoting the vault off the agent's public HTTPS price feed, so nothing depends on a laptop staying awake.
- **Vercel:** the dashboard, reading the agent's free activity log and the indexer.
- **Releases:** every merge to `main` redeploys both. Changes land in `staging` first.

## Stack

TypeScript on Node 24, run directly without a build step. pnpm workspaces for the agent, indexer, dashboard and shared packages. viem for Celo, Solidity with Foundry for the Taker, Next.js 16 with Tailwind 4 and shadcn/ui for the dashboard, SQLite for the indexer, and Biome and Vitest for quality checks. Onchain standards: ERC-8004 (agent identity and reviews), ERC-8021 (attribution tags), EIP-1271 (contract signatures) and x402 (paid HTTP).
