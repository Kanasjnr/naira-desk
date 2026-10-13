# Naira Desk

An autonomous, community-funded naira market maker on Celo.

Naira Desk runs a [Textile FX](https://app.textilecredit.com) Operator Vault for the cNGN/USD₮ corridor. Community LPs deposit into the vault. An agent prices the naira from several independent sources, reads market news through paid [buy](https://usebuy.ai) calls, and decides when to quote, when to widen and when to stop. Every fill, the vault's NAV per share and the agent's paid calls are published so anyone can verify them onchain.

Built for the **Agents on Open Rails** hackathon (Celo), targeting the Textile FX and Build with buy tracks.

## Status

Early development. Nothing here is production-ready, and no vault has been deployed yet.

## How it works

- **Vault:** a Textile Operator Vault (cNGN/USD₮) on Celo mainnet. LPs deposit USD₮ or cNGN and receive shares. The operator can't withdraw LP funds; the contract enforces it.
- **Execution:** Textile's Stitch bot answers RFQs with the agent's key as the vault's strategy signer. Textile's Warp service co-signs every fill.
- **Agent:** prices cNGN, sets a risk regime from data and news, can pause the vault, and reports.
- **Proof:** a public page with fills, P&L, NAV per share, paid calls and attribution coverage.

## Hackathon requirements

- Celo mainnet only.
- Every transaction sent by this project carries the ERC-8021 attribution tag `celo_1944046be211`.
- The agent registers an ERC-8004 identity from its own wallet.

## Design

The full design, with diagrams, is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

[MIT](LICENSE)
