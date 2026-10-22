# Naira Desk

An onchain bureau de change for the naira.

Naira Desk trades cNGN, a naira stablecoin, onchain. Like a street BDC, it buys naira a little below the market rate and sells a little above. Unlike one, it's run by an autonomous agent, quotes around the clock on Celo, publishes every trade, and its float comes from community depositors who share the spread.

Under the hood, Naira Desk runs a [Textile FX](https://app.textilecredit.com) Operator Vault for the cNGN/USD₮ corridor. Community LPs deposit into the vault. An agent prices the naira from several independent sources, reads market news through paid [buy](https://usebuy.ai) calls, and decides when to quote, when to widen and when to stop. Every fill, the vault's NAV per share and the agent's paid calls are published so anyone can verify them onchain.

Built for the **Agents on Open Rails** hackathon (Celo), targeting the Textile FX and Build with buy tracks.

## Status

Early development. The vault is live on Celo mainnet at [`0xD713…AD6C`](https://celoscan.io/address/0xD7137d85607BE18628CE00B1020895cEBceEAD6C) but isn't trading yet. The agent is ERC-8004 agent [#9908](https://celoscan.io/nft/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/9908).

## How it works

- **Vault:** a Textile Operator Vault (cNGN/USD₮) on Celo mainnet. LPs deposit USD₮ or cNGN and receive shares. The operator can't withdraw LP funds; the contract enforces it.
- **Execution:** the agent's wallet owns the vault. Textile's Stitch bot answers RFQs with its own key as the vault's strategy signer, and Textile's Warp service co-signs every fill.
- **Agent:** prices cNGN from several sources and watches for sharp moves. On a schedule, and whenever the price jumps or sources disagree, it pays through [buy](https://usebuy.ai) for recent naira news, street-rate posts and an AI read of both. It checks the onchain price against the official and parallel rates people are quoting, then quotes normally, carefully, or stops quoting for at least two hours. Every decision is logged with its payment receipts, and once a day the agent rates each service it paid on their ERC-8004 identities, scored on how many paid calls delivered.
- **Naira API:** the agent sells what it learns. `GET /v1/naira` returns the onchain cNGN rate, the official and parallel rates from the posts it bought, and its current risk call with the payment receipts behind it. It costs $0.005 over x402, payable in USDC, USD₮ or USA₮ with any [buy](https://usebuy.ai) client, and the agent settles each payment onchain itself.
- **Dashboard:** `apps/web` (Next.js, shadcn/ui) shows the onchain, official and street rates over time with the agent's careful and halted spans, every risk check and what it decided, supplier reviews and API sales, each linked to its transaction. It reads the agent's free `/v1/tape`.

## Hackathon requirements

- Celo mainnet only.
- Every transaction sent by this project carries the ERC-8021 attribution tag `celo_1944046be211`.
- The agent registers an ERC-8004 identity from its own wallet.

## Design

The full design, with diagrams, is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Development

Requires Node 24 (see `.nvmrc`) and pnpm 10.

```sh
pnpm install
pnpm check   # lint, typecheck and tests
pnpm fix     # apply formatting and safe lint fixes
pnpm agent   # the agent: price feed for Stitch, risk desk, naira API
pnpm web     # the dashboard on http://localhost:3000 (AGENT_URL defaults to http://127.0.0.1:8788)
```

Changes land through pull requests into `staging`, which is for shadow-mode testing. A release pull request from `staging` updates `main`, the version that runs live.

## License

[MIT](LICENSE)
