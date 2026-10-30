# Naira Desk

An onchain bureau de change for the naira.

**Live dashboard: [naira-desk.vercel.app](https://naira-desk.vercel.app)**. The agent, the indexer and Textile's Stitch bot run around the clock on Northflank, with Stitch quoting the vault off the agent's own price feed, and every number on the dashboard links to its Celo transaction. Raw data: [activity log](https://p02--naira-desk--dtp6fbr6m2jg.code.run/v1/tape), [Taker trades](https://p03--naira-desk--dtp6fbr6m2jg.code.run/api/taker), [Stitch's price feed](https://p01--naira-desk--dtp6fbr6m2jg.code.run/feed/cngn-usdt).

Naira Desk trades cNGN, a naira stablecoin, onchain. Like a street BDC, it makes a market, quoting both sides to anyone who asks, and it takes a good price when another dealer offers one. Unlike one, it's run by an autonomous agent, trades around the clock on Celo and publishes every trade.

Under the hood, Naira Desk runs a community-funded [Textile FX](https://app.textilecredit.com) Operator Vault for the cNGN/USD₮ corridor, and a small contract that buys mispriced quotes on Textile and sells them on Uniswap in one transaction. The agent prices the naira, reads market news through paid [buy](https://usebuy.ai) calls, and decides when the vault quotes, when it's careful and when it stops. Every fill, the vault's NAV per share, the contract's trades and the agent's paid calls are published so anyone can verify them onchain.

Built for the **Agents on Open Rails** hackathon (Celo), targeting the Textile FX and Build with buy tracks.

## Status

Live on Celo mainnet. The vault quotes on Textile and the Taker trades from the agent's float, around the clock.

| | Address | What it is |
|---|---|---|
| Agent wallet | [`0xE4D88C9A86bd42D4f5D05a234E6D56f71bB58582`](https://celoscan.io/address/0xE4D88C9A86bd42D4f5D05a234E6D56f71bB58582) | ERC-8004 agent [#9908](https://celoscan.io/nft/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/9908). Sends every tagged transaction: takes, vault admin, reviews, sale settlements. |
| Taker | [`0xcf024F46d1756498f3ffD04F1Da4793eE1eFdA57`](https://celoscan.io/address/0xcf024F46d1756498f3ffD04F1Da4793eE1eFdA57) | The agent's trading contract, owned by the agent wallet. Every Textile fill and Uniswap sale runs through it. Source verified on Sourcify. |
| Vault | [`0xD7137d85607BE18628CE00B1020895cEBceEAD6C`](https://celoscan.io/address/0xD7137d85607BE18628CE00B1020895cEBceEAD6C) | The community-funded Textile Operator Vault for cNGN/USD₮, administered by the agent wallet. |

## Verify it in two minutes

1. Open the [dashboard](https://naira-desk.vercel.app). The ticker at the top shows the desk's total volume and its tagged transactions, and refreshes every 15 seconds.
2. In **Taker**, click any trade. It opens one Celo transaction, [like this wARS take](https://celoscan.io/tx/0xc4adc75257f1c9b41c2fa9e1382c92f9861d510f7e6c3e37c0a7bed1504f09d3), sent by the agent wallet to the Taker: the Textile maker's order fills, the tokens are sold on Uniswap, and the Taker's `Took` event shows what it paid, what the pool paid back and the profit.
3. Scroll to the end of that transaction's input data: it ends in the attribution tag `celo_1944046be211`, like every transaction the agent sends.
4. Ask the naira API for a rate: `curl -i https://p02--naira-desk--dtp6fbr6m2jg.code.run/v1/naira` answers `402 Payment Required` with an x402 offer of $0.005. `pnpm api:buy` pays it and prints the answer.
5. Read the [Taker's verified source](https://celo.blockscout.com/address/0xcf024F46d1756498f3ffD04F1Da4793eE1eFdA57?tab=contract): only the agent can trade, and its money can only be withdrawn to the operator's wallet.

## How it works

- **Vault:** a Textile Operator Vault (cNGN/USD₮) on Celo mainnet. LPs deposit USD₮ or cNGN and receive shares. It quotes at the price cNGN trades on Uniswap, so nobody can buy from it and sell to the pool at a profit. The operator can't withdraw LP funds; the contract enforces it.
- **Taker:** a small contract the agent owns. When a Textile maker quotes below Uniswap, on cNGN, wBRL, wARS or any pair with a pool, the agent asks for a firm quote in the contract's name, and the contract fills it and sells on Uniswap in the same transaction. If the trade wouldn't make money, it reverts. The agent checks every 15 seconds and logs every gap it sees, taken or not.
- **Execution:** the agent's wallet owns the vault. Textile's Stitch bot answers RFQs with its own key as the vault's strategy signer, and Textile's Warp service co-signs every fill.
- **Agent:** prices cNGN where it trades onchain, checks it still tracks the naira on Luno and Textile, and watches for sharp moves. On a schedule, and whenever the price jumps or cNGN drifts from the naira, it pays through [buy](https://usebuy.ai) for recent naira news, street-rate posts and an AI read of both. It checks the onchain price against the official and parallel rates people are quoting, then quotes normally, carefully, or stops quoting for at least two hours. Every decision is logged with its payment receipts, and once a day the agent rates each service it paid on their ERC-8004 identities, scored on how many paid calls delivered.
- **Naira API:** the agent sells what it learns. `GET /v1/naira` returns the onchain cNGN rate, the official and parallel rates from the posts it bought, and its current risk call with the payment receipts behind it. It costs $0.005 over x402, payable in USDC, USD₮ or USA₮ with any [buy](https://usebuy.ai) client, and the agent settles each payment onchain itself.
- **Dashboard:** `apps/web` (Next.js, shadcn/ui) shows the onchain, official and street rates over time with the agent's careful and halted spans, the vault's value, share price and fills, the Taker's trades, profit and the gaps the agent saw, every risk check and what it decided, supplier reviews and API sales, each linked to its transaction. It reads the agent's free `/v1/tape` and the indexer.

## Hackathon tracks

**Open Corridors: Textile FX.** Naira Desk works both sides of Textile's RFQ venue. As a maker, it runs its own Operator Vault on the cNGN/USD₮ corridor, deployed from the agent wallet, with Textile's Stitch quoting it off the agent's own price feed and Warp co-signing each fill. As a taker, the agent reads every pair's ladder from `/v2/rfq/levels`, asks for a firm quote in the Taker's name only when a maker sits under Uniswap, proves control through EIP-1271, fills and sells in one transaction, and reports the fill back to Textile.

**Build with buy.** The agent pays for its own research through buy: naira news, street-rate posts and an AI read of both, bought on a schedule and whenever the market moves. That research decides whether the vault quotes normally, carefully or not at all. Once a day it rates each supplier on their ERC-8004 identity, and it sells what it learned as its own paid API over x402.

**Requirements.** Celo mainnet only. Every transaction the project sends carries the ERC-8021 attribution tag `celo_1944046be211`; the agent's wallet refuses to sign one without it. The agent registered its ERC-8004 identity from its own wallet.

## Docs

- [How i built it](docs/BUILD_NOTES.md): the story, the decisions, what i tried and what i dropped.
- [Architecture](docs/ARCHITECTURE.md): the full design, with diagrams, contracts, flows and the threat model.

## Development

Requires Node 24 (see `.nvmrc`) and pnpm 10.

```sh
pnpm install
pnpm check   # lint, typecheck and tests
pnpm fix     # apply formatting and safe lint fixes
pnpm agent   # the agent: price feed for Stitch, risk desk, naira API, trader (TAKES=off only watches)
pnpm indexer # vault events, fills and Taker trades from chain into SQLite, served on http://127.0.0.1:8789/api/summary
pnpm web     # the dashboard on http://localhost:3000 (AGENT_URL and INDEXER_URL default to ports 8788 and 8789)
pnpm --filter @naira-desk/contracts test  # the Taker contract, replaying real Textile fills on a Celo fork (needs Foundry)
pnpm taker:take --dry-run  # the best Textile-under-Uniswap gap right now; drop --dry-run to take it
pnpm api:buy  # pay the agent's naira API $0.005 over x402 from a demo buyer (first run creates it; shown as ours, never counted)
```

### Deploy

The `Dockerfile` runs the agent and the indexer in one container. Give it a volume at `/data`, expose ports 8787 (Stitch's feed), 8788 (the naira API and tape) and 8789 (the indexer), and set:

- `AGENT_KEY`: the agent's private key, as a secret. It's written once to the volume.
- `API_URL`: the public address of port 8788, so x402 payment requests name the right resource.
- `NAIRA_DESK_SEED` (optional): logs from another machine, `COPYFILE_DISABLE=1 tar czf - -C ~/.naira-desk $(cd ~/.naira-desk && ls *.jsonl) | base64`, unpacked once on first start.

The live desk runs this container on [Northflank](https://northflank.com) with a volume at `/data`, next to a second service running Textile's Stitch image (`ghcr.io/textile-protocol/textile-stitch`) with the vault bot's `stitch.toml`, signer key and maker credential as secrets, and its `[feed].url` set to port 8787's public HTTPS address. The dashboard is on Vercel, with the project root at `apps/web` and `AGENT_URL` and `INDEXER_URL` pointing at the container's ports 8788 and 8789. Both redeploy on every merge to `main`.

Changes land through pull requests into `staging`, which is for shadow-mode testing. A release pull request from `staging` updates `main`, the version that runs live.

## License

[MIT](LICENSE)
