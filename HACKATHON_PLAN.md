# Agents on Open Rails (Celo): Hackathon Plan

*Prepared Tue 13 Oct 2026. Real ship date Fri 30 Oct. Official deadline Mon 9 Nov, 09:00 GMT.*

**Recommendation in one line:** Build **Naira Desk**, an autonomous market-making agent for cNGN (then wARS/wBRL) against USD₮ on Textile FX, Celo mainnet. Add a small **buy** integration so the agent pays for its own market intel. That targets Textile FX (main bet) and Build with buy (cheap add-on). Skip the cash-out and remittance ideas for this hackathon, even though they're closer to FX Remit. The reasons are in section 4.

> ### Update, 13 Oct: no own capital, so fund Naira Desk with a vault
>
> - **Constraint.** You can't fund a trading float. Section 5's "$600–1,500 float" is out. Out-of-pocket costs are limited to a few dollars of gas.
> - **Attribution code:** `celo_1944046be211`. Confirm which repo slug it was issued for, and never rename that repo.
> - **Verified: anyone can deploy an Operator Vault.** `OperatorVaultFactory` on Celo (`0x88104decA449C797632AfdcA77A3140b24cD844A`, verified source) only checks `msg.sender == init.operatorAdmin` in `deployVault`. `requestDeposit` / `requestDepositCorridor` have no allowlist.
> - **Existing vaults:** two **USDT/IDRX** vaults (deployed 2–3 Oct by Safe `0x52e5…488a`). **No cNGN vault on Celo yet.**
> - **New funding path: the community-funded "Naira Desk Vault."** Full design with diagrams in **[ARCHITECTURE.md](ARCHITECTURE.md)**.
>   - Deploy a cNGN/USD₮ Operator Vault (gas only).
>   - Community LPs deposit small amounts ($5–50 each). Every deposit is a tagged transaction from an independent wallet.
>   - The trading agent is the `strategySigner`. The `riskSigner` is **Textile's Warp co-signer**. The deep review showed both existing Celo vaults use it, so it isn't our own agent. Every fill needs both signatures.
>   - Your personal wallet is `operatorAdmin` and `feeRecipient`. A separate watchdog key is `guardian`, so the vault can pause itself while you travel. You earn the performance fee only when LPs earn.
>   - Stitch points at the vault.
> - **Confirmed by Textile's CEO and CTO (13 Oct):**
>   - The maker key is self-serve through the Stitch wizard.
>   - Our vault is included in RFQ requests, and Warp co-signs its fills.
>   - Stitch and Textile run epochs and NAV.
>   - Vault-maker fills count for the Textile track.
>   - Deploy with the `/s/vaults/deploy` presets, with the strategy signer set to the Stitch wallet.
> - **Other fx-docs facts:**
>   - Live *taker* keys come from a self-serve form in the app and are usually approved once the email is confirmed. Maker keys still go through contact@textilecredit.com.
>   - Testnets are BSC testnet and Base Sepolia only, with no Celo Sepolia.
>   - Limits: 60 requests/minute and 4 outstanding RFQs per taker.
> - **Fallback (no capital and no inventory needed):** **FX402**. Customers pay via x402, the agent runs a Textile RFQ as taker, then delivers cNGN/wARS/wBRL and keeps a fee. Textile track plus buy.
> - **Decision: GO on the vault path (13 Oct).** The new bottleneck is LP deposits: line up depositors now so funds land around 17–19 Oct.

---

## 1. Hard constraints (from the source material)

1. **Celo mainnet only (chain 42220).** Testnet code can stay in the repo, but testnet activity counts for nothing.
2. **Deadlines.** Registration and submission close Mon 9 Nov, 09:00 GMT. Winners are announced Fri 13 Nov. Late registration is allowed. The hackathon started Tue 6 Oct.
3. **ERC-8021 attribution tag.** The code is issued when you enroll. It must be appended to the calldata of *every* transaction your agent or app sends, starting with the first one. Untagged transactions can never be credited. It goes in the wallet client (`withAttribution(code)` in `@celo/attribution-tags`), not in contracts. Programs credit only the code they assigned, so a self-derived code doesn't count.
4. **x402 settlements on Celo are currently untagged.** The facilitator submits them, and facilitator-side Schema 2 tagging hasn't shipped yet (x402-rs PR #99). Any x402 or buy volume is therefore measured by some other means. See the questions in section 6.
5. **ERC-8004 identity is required for every track.** Register from the agent wallet: the registering address becomes the owner *and* the published payment wallet. Add that wallet to your entry. The Identity Registry is `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`.
6. **Public GitHub repo** at registration, still resolving at judging time. **Code must be written during the hackathon.** You can't copy FX Remit code, but you can reuse what you know. Any framework is allowed.
7. **Independent user:** a wallet that isn't yours, wasn't first funded by you or your main funder, and had Celo activity before 6 Oct. Self-funded wallets don't count.
8. **Gas.** Sponsored or gasless flows aren't penalized, and signers and authorizers count. Gas your relayer pays doesn't count as your contribution, so document that architecture.
9. **Scoring.** Each track is scored by a published query, and the live leaderboard uses the same query. A human panel and the Loops judge then read the repo. If the dashboard flags something, you get 48 hours to answer privately. Organizers recommend stating where your users and volume came from.
10. **Multiple tracks are allowed, but one prize per track per team.** If nothing fits, enter the closest track and explain why.
11. **Track criteria.**
    - *Textile:* strategy P&L, volume quoted and filled, originality.
    - *USA₮/x402:* real USA₮ settlement between independent parties, with the currency choice justified by the user it serves.
    - *LatAm:* works on mainnet with real wFIAT, real use of wFIAT and the Celo stack, an autonomous and useful agent, a UX a real person can use, clear LatAm impact.
    - *buy:* verified paid calls from your tagged wallet into services you don't control, plus the growth those calls create for the services. Independent users are a qualifier, and spamming cheap calls scores zero.
12. **x402 facilitator** (`api.x402.celo.org`, checked live). It supports USDC, USDT and USAT via EIP-3009, and wARS, wBRL and **wCOP** via Permit2. `/settle` needs an API key plus credits at $0.001 per settlement. The `"$0.01"` price shorthand throws on Celo, so use an explicit asset object.
13. **Textile FX on Celo.** Corridors: cNGN, USDC, wARS, wBRL and IDRX against USD₮. Quotes are RFQ: firm, bound to the taker, all-or-nothing, with a 60-second TTL. The taker broadcasts the swap. The taker fee is 1 bp. Live trading keys need an access request. **Makers (fillers) need a maker key from Textile** (email contact@textilecredit.com) and quote through Stitch, Textile's AGPL Rust bot. **Filling is open at the contract level.**

## 2. What I verified live today (13 Oct), and what it means

Textile `POST /v2/rfq/preview` on chain 42220 (indicative, no taker):

| Corridor (Celo) | Indicative rate | Published depth | Read |
|---|---|---|---|
| USD₮ → cNGN, $100 | 1,364.63 cNGN/USD₮ | ~$15.2k on this side | Tight |
| cNGN → USD₮, ₦150k | 1,365.18 cNGN/USD₮ | ~₦41.9M (~$30.7k) | ~4 bp round trip *including* 2× 1 bp fees, so incumbents quote ~1 bp each side |
| USD₮ → wARS, $100 | 1,610.2 wARS/USD₮ | **~$6.6k** | Thin: room for a second maker |
| USD₮ → wBRL, $100 | 5.0211 wBRL/USD₮ | ~$100k | Deep |
| USDC → USD₮ | **no_makers_online** | none | Empty corridor (and probably empty demand) |

24-hour tickers (`api.textilecredit.com/tickers`, likely all chains combined): USDT_NGN ≈ $348k, USDT_WBRL ≈ $9.2k, USDT_WARS ≈ $4.8k, USDT_USAT ≈ $700.

Textile Ramp providers (`/v2/ramp/providers`): **Busha NGN↔cNGN supports chainIds 56 (BSC) and 8453 (Base) only. Celo isn't supported.**

**Implications (blunt):**
- **cNGN is where the money is, but it's already tightly made.** A newcomer with $1k won't win by being the cheapest. Your edge has to come from distribution, off-hours and overflow liquidity, and covering more corridors. The section 5 strategy is built on this.
- **wARS is thin.** LatAm hackathon teams will be *takers* there during the event, and every one of them is a potential counterparty.
- **There's no naira bank off-ramp from Celo through Textile.** Any "cash out to a Nigerian bank from Celo" product needs a cross-chain hop that I couldn't verify. That hurts ideas 3, 4 and 6.
- **Textile is a sponsor that needs makers.** The filler program says it is "onboarding operators now," which gives them a reason to help you.

---

## 3. Eight ideas

### Idea 1: Naira Desk, an autonomous cNGN market-making agent (Textile filler)
1. **Pitch / pain.** A 24/7 onchain bureau de change for the naira on Celo. It quotes cNGN/USD₮ (later wARS and wBRL) on Textile, prices from the real Nigerian FX market, manages its own inventory and risk, and pays for its own intel. *Pain:* liquidity for Nigerians and Nigeria-facing apps swapping cNGN↔USD₮ runs out on size, nights and weekends, and Textile needs more operators to fix that.
2. **Tracks.** **Textile FX** is the main one. It's the only idea that scores directly on all three criteria: maker P&L, volume quoted *and* filled, and originality. **buy** is the add-on.
3. **Why an agent.** It makes thousands of priced commitments a day with its own money. It decides spread skew, size, which corridors to quote, when to rebalance, which data is worth buying, and when to stop itself. It also has to run unattended from 1 to 9 Nov while you travel.
4. **Onchain loop.** An independent taker requests an RFQ. Textile fans it out. Stitch (driven by the agent's price feed) signs a taker-bound order. The taker broadcasts `executeBatch` on the LimitOrderReactor (`0xa9AA…35b3`), and USD₮ and cNGN swap between the taker and the agent wallet in one transaction. The agent earns the spread and the protocol takes 1 bp from the taker. The agent's *own* transactions carry the tag: ERC-8004 register, Permit2 approvals, rebalancing RFQs, limit-order fills, and buy `send`. The agent pays USDC over x402 through buy for news and social data, LLM classification and address screening.
5. **First counterparties.** Textile routes RFQs to every online maker, so counterparties come to you, but you only win when you're the best quote. Four sources, honestly ranked:
   - (a) **Preferred-liquidity deep links.** Textile lets any link steer RFQs to named makers first. Share them with Nigerian Celo and MiniPay communities and, disclosed, with FX Remit users.
   - (b) LatAm hackathon teams swapping into wARS/wBRL.
   - (c) Overflow when incumbent depth (~$15k) runs out.
   - (d) Resting limit orders the agent fills.
6. **Biggest risk.** (1) Textile doesn't issue a Celo maker key in time. (2) Incumbents quoting ~1 bp per side keep winning the flow. (3) Inventory loss if the naira moves.
   - *De-risk (1):* email today; fallback to permissionless limit-order filling.
   - *De-risk (2):* compete on distribution, off-hours and size, not price.
   - *De-risk (3):* cap cNGN at 40% of NAV, skew quotes, set a daily loss limit, start with tiny caps.
7. **Scope.**
   - *MVP:* cNGN/USD₮ quoting via Stitch; the agent's fair-value feed from at least 3 sources; inventory skew; kill switches; fill indexer; P&L; public proof page; ERC-8004 identity and tags.
   - *Then:* wARS and wBRL; buy intel.
   - *Cut:* writing your own maker protocol client, the Operator Vault (phase 2 only), ML pricing, other chains.

### Idea 2: Community Naira Vault, a Textile Operator Vault run by the agent
1. **Pitch / pain.** Nigerians deposit USD₮ or cNGN into a Textile Operator Vault. The agent quotes with the pooled capital and the spread accrues to LPs. The operator *can't withdraw* (enforced onchain). *Pain:* USD₮ holders have no yield tied to real FX flow, and makers are short of capital.
2. **Tracks.** Textile, phrased as "treasury agent managing currency exposure" at real scale. LP wallets are independent users.
3. **Why an agent.** Its strategy key signs quotes and co-signs NAV valuations, closes epochs, and runs close-only mode during redemptions.
4. **Onchain loop.** LP deposits flow into an epoch, then shares are minted. Fills need two signatures (strategy key plus risk key). Redemptions pay out pro-rata in both assets.
5. **Users.** Your Celo and Lagos network. Realistically 5–15 people putting in $20–$200 each, and only if they trust you personally.
6. **Biggest risk.** I couldn't confirm whether vault deployment through the factory is permissionless or gated by Textile. It also needs two-key infrastructure. And pooling money from the public risks being treated as a collective investment scheme under Nigerian SEC rules. If LPs lose money to a naira move, the damage lands on your reputation.
7. **Scope.** Not doable *on top of* idea 1 in two weeks unless Textile hands you a ready vault and a runbook by about 20 Oct. **Treat it as phase 2 / post-hackathon, and mention it as a roadmap item in the submission.**

### Idea 3: Celo-to-Naira cash-out agent
1. **Pitch / pain.** "Send USD₮ on Celo, get naira in your bank in minutes." Nigerian MiniPay and Valora users earning dollars on Celo can't easily cash out to a bank.
2. **Tracks.** Textile (taker volume), buy (sanctions screening before payout), x402 (only if users pay in USA₮, which they won't).
3. **Why an agent.** It quotes an all-in rate, picks the route and timing, and runs a bridge-plus-ramp state machine with retries and refunds.
4. **Onchain loop.** User transfers USD₮ to the agent (tagged, from your web app). The agent swaps USD₮→cNGN via RFQ (tagged), **bridges cNGN to Base (unverified)**, then calls Textile Ramp `sell` (Busha) to pay a Nigerian bank account.
5. **Users.** The easiest of any idea: people want naira.
6. **Biggest risk.** The verified gap: Textile Ramp doesn't run on Celo. You would also be a custodial money transmitter. A failure mid-route strands user funds.
7. **Blunt.** This is FX Remit wearing a hackathon costume. It's a good business, but the Celo-specific leg is its weakest part, and it scores poorly on Textile P&L. Build it as FX Remit after the hackathon.

### Idea 4: Naira treasury agent for freelancers and SMEs
1. **Pitch.** A freelancer sets a policy, for example "keep 3 months of expenses in cNGN, convert above ₦X, max $Y/day," and the agent executes it on Textile.
2. **Tracks.** Textile.
3. **Why an agent.** Executing a policy and timing conversions.
4. **Onchain loop.** RFQ quotes are bound to the taker, so either the agent custodies user funds (bad) or you build smart-account session keys (a week of work by themselves).
5. **Users.** A few freelancers you know, but cNGN on Celo is hard to spend or off-ramp.
6. **Biggest risk.** A taker's P&L is structurally negative because it pays spread plus fee, so the judges' P&L column looks bad.
7. **Blunt: weak. Skip.**

### Idea 5: Lagos↔São Paulo cross-corridor router (cNGN↔USD₮↔wBRL/wARS)
1. **Pitch.** One all-in quote to move naira into reais or pesos, built from two Textile RFQs. Aimed at Nigerian importers paying Brazilian suppliers and at students.
2. **Tracks.** Textile plus LatAm.
3. **Why an agent.** Managing leg risk on 60-second quotes, and guaranteeing the rate.
4. **Onchain loop.** User → agent → RFQ1 → RFQ2 → delivery.
5. **Users.** Close to zero in two weeks. The Nigeria–LatAm retail corridor doesn't exist onchain yet.
6. **Biggest risk.** Self-generated volume (wash-trading optics) and leg risk.
7. **Blunt.** Great slide, weak product. Ship it as a *feature* of Naira Desk (a public cross-rate quote endpoint), not as a project.

### Idea 6: USA₮ diaspora remittance over x402 (US → Nigeria / LatAm)
1. **Pitch / pain.** A US-based sender pays USA₮ via x402, gasless through EIP-3009, and family receives cNGN, wARS or wBRL. *Currency justification:* USA₮ is the US-regulated dollar (Anchorage-issued, built to meet the GENIUS Act) that a US sender can hold compliantly. That's exactly the argument the USA₮ judges want.
2. **Tracks.** USA₮ x402, Textile and LatAm.
3. **Why an agent.** Quoting, routing, delivery and receipts.
4. **Onchain loop.** The sender signs a USA₮ authorization and the facilitator settles it to the agent. The agent converts USA₮→USD₮ (no Textile USAT corridor is listed on Celo; unverified), runs an RFQ, then transfers to the recipient.
5. **Users.** US diaspora holding USA₮ *on Celo* with Celo activity before 6 Oct. Practically nobody.
6. **Biggest risk.** No independent payers, money transmission, and USA₮ liquidity.
7. **Blunt.** Best story for the USA₮ judges, worst user acquisition. Skip unless you already know 10 US-based senders who will do it.

### Idea 7: Paid FX oracle over x402
1. **Pitch.** An NGN/ARS/BRL/COP fair-value feed in Stitch-compatible format, sold per call over x402.
2. **Tracks.** USA₮ x402 and LatAm.
3. **Why an agent.** It barely is one; it's an API.
4. **Onchain loop.** Other agents pay per call. Stitch itself can't pay x402.
5. **Users.** Other hackathon teams, which looks like a ring of builders paying each other.
6. **Biggest risk.** Spam optics, and low value.
7. **Blunt: weak.** Publish Naira Desk's feed for free instead. It works as goodwill and adds to originality.

### Idea 8: Naira-funded procurement agent (pay for dollar-priced services via buy)
1. **Pitch / pain.** Nigerian devs fund an agent with cNGN. It converts on Textile and buys compute, data and browser sessions from buy's catalog. *Pain:* Nigerian bank cards have tight FX limits on international spending (check today's limits).
2. **Tracks.** buy plus Textile.
3. **Why an agent.** Picking vendors, quoting, buying and managing the float.
4. **Onchain loop.** cNGN → Textile → USDC → x402 payments to vendors.
5. **Users.** Nigerian dev community, but they'd need cNGN *on Celo* first (the on-ramp only runs on BSC/Base). The buy catalog is narrow: GCP VMs, scrapers, an LLM in closed beta.
6. **Biggest risk.** Poor catalog fit, and it looks like a reseller.
7. **Middling.** Reasonable buy entry, poor Textile P&L.

---

## 4. Scoring and recommendation

Scores are 1–5; higher is better.

| # | Idea | Judging fit | Originality | Feasibility (solo, 2 wks) | Ease of independent users | Demo clarity | **Total** |
|---|---|---|---|---|---|---|---|
| 1 | **Naira Desk (cNGN maker agent)** | 5 | 4 | 4 | 5 | 4 | **22** |
| 2 | Community Naira Vault | 5 | 5 | 2 | 3 | 4 | 19 |
| 3 | Celo→Naira cash-out | 3 | 3 | 2 | 4 | 5 | 17 |
| 5 | Lagos↔São Paulo router | 3 | 4 | 3 | 1 | 4 | 15 |
| 8 | Naira procurement via buy | 3 | 4 | 3 | 2 | 3 | 15 |
| 6 | USA₮ diaspora remit | 4 | 3 | 2 | 1 | 4 | 14 |
| 4 | Naira treasury agent | 2 | 2 | 3 | 3 | 3 | 13 |
| 7 | Paid FX oracle | 2 | 2 | 5 | 2 | 2 | 13 |

**Flagship: Naira Desk. Add-on: buy-powered risk intel and counterparty screening (qualifies for Build with buy, roughly $20 of spend).**

**Why this one.** The Textile criteria describe a market maker: P&L, *volume quoted*, filled. Most entrants will build an LLM agent that swaps its own money as a *taker*. That design loses money by construction (it pays the spread plus 1 bp), and its volume is self-generated, which looks like wash trading. Naira Desk sits on the earning side of the market:
- Every fill is with an independent taker, so it can't self-deal.
- Every RFQ it answers counts as quoted volume.
- P&L can be positive.
- It's the only entry likely to price the naira from the actual Nigerian FX market (NFEM, P2P and exchange rates, weekend gaps, CBN event risk). Your location in Lagos is a real advantage here.

The "agent" claim is defensible because it runs *unattended for 9 days* with its own money, its own risk limits and its own data budget. Textile is a sponsor that needs operators, so it has a reason to help you get set up.

**Why not the FX Remit-style ideas.** The verified Celo gap (no Celo off-ramp through Textile Ramp), custody and compliance load, and weak P&L scoring make them worse hackathon bets even though they're better long-term businesses.

**LatAm track.** Quoting wARS/wBRL is "real use of wFIAT," but a market maker has no consumer UX and only indirect LatAm impact, so it would score 2/5 there at best. Enter as closest fit only if it costs nothing; don't build for it.

**USA₮ track.** Skip it. You have no credible pool of independent USA₮ payers.

---

## 5. Flagship plan: Naira Desk

### 5.1 Architecture

```
                         CELO MAINNET (42220)
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │  Independent takers ──executeBatch(signed orders)──► Textile LimitOrderReactor│
 │  (Textile app, deep-link users,                      0xa9AA0a64…C235b3        │
 │   LatAm teams, aggregators)                          USD₮ ⇄ cNGN/wARS/wBRL    │
 │                                                      taker ⇄ AGENT WALLET     │
 │                                                                               │
 │  AGENT WALLET (hot EOA, capped float) ── register(agentURI) ──► ERC-8004       │
 │   every tx it sends: + ERC-8021 suffix               Identity 0x8004A169…a432  │
 │   (8004 register, Permit2 approvals, rebalancing RFQs, limit fills, buy send) │
 └──────────▲──────────────────────────────────────────────▲────────────────────┘
            │ signs taker-bound orders                      │ getLogs (fills)
 ┌──────────┴─────────────┐   polls {price,timestamp}  ┌────┴───────────────────────┐
 │ STITCH (Rust, AGPL,    │ ◄───────────────────────── │ FEED SERVER (Hono)          │
 │ pinned release, Docker)│   /feed/cngn /feed/wars …  │  skewed fair value/corridor │
 │ maker key → Textile RFQ│                            └────▲───────────────────────┘
 │ stream; caps per pool  │                                 │
 └────────────────────────┘                  ┌──────────────┴───────────────────────┐
                                             │ AGENT BRAIN (TypeScript)              │
   Price sources ──────────────────────────► │  fair value: median of sources,       │
   Textile tickers + previews (Celo, BSC),   │   outlier rejection, staleness gate   │
   NG exchange tickers, P2P (ToS-checked),   │  inventory skew (target ±40% band)    │
   CBN NFEM anchor; ARS: CriptoYa/dolarapi;  │  vol/regime → spread tier → Stitch    │
   BRL: BCB/AwesomeAPI (all to be verified)  │  risk officer (LLM, can only WIDEN or │
                                             │   HALT, never tighten past floor)     │
   buy gateway (x402, USDC, gas sponsored)◄──│  data buyer: X/news search, LLM       │
   paid calls, each logged with the          │   classify, address screening;        │
   decision it informed                      │   hard budget, EV check per call      │
                                             │  rebalancer: RFQ taker (tagged),      │
                                             │   restrictedLiquidityWallets = OTHER  │
                                             │   makers only → never self-matches    │
                                             │  kill switches + Telegram alerts/cmds │
                                             └──────────────┬───────────────────────┘
                                                            │
             INDEXER (viem getLogs on reactor + ERC20 transfers) → SQLite
               → METRICS API (read-only) → /proof dashboard (Vercel)
               → independence checker (first funder, first tx < 6 Oct) per counterparty
```

**Attribution wiring (do this before any transaction):**
- `packages/chain/wallet.ts` is the *only* place a wallet client gets created: `createWalletClient(...).extend(withAttribution([ASSIGNED_CODE]))`. CI fails if any other file imports `createWalletClient`. With viem ≥ 2.45 you can use the client-level `dataSuffix` instead, but don't use both.
- **Choose the final repo name before you enroll.** The Celo Builders code is `codeFromRepo(owner/repo)`, so renaming changes it. Never rename or transfer the repo. If the assigned code differs from `codeFromRepo`, attach both codes (the SDK accepts an array).
- `scripts/verify-tags.ts` runs `verifyTx` on every transaction the agent wallet has ever sent. The dashboard shows "N/N agent txs tagged."
- **Stitch-sent transactions are the gap.** Stitch is Rust and doesn't know about ERC-8021. Plan:
  - (a) Do Permit2 approvals from TypeScript (tagged) instead of `stitch approve`.
  - (b) Keep `limit_taker_enabled = false` until (c) lands.
  - (c) Patch Stitch's transaction builder to append the suffix (small Rust change; AGPL means you publish the fork, which you would anyway). Upstream the patch as a goodwill PR to Textile.
- **RFQ fills are broadcast by the taker**, so the fill transaction carries the *taker's* tag, not yours. Your maker identity appears as the order signer and the counterparty in the fill. Ask organizers how the Textile query credits makers (section 6).
- **Gas.** The agent wallet pays its own gas in CELO, which counts as your contribution. Takers pay gas for fills. The buy gateway sponsors gas for x402 settlements; document that in ARCHITECTURE.md.

**ERC-8004 registration file**, hosted at `https://<your-domain>/.well-known/agent-registration.json`. A stable HTTPS URL means edits don't require `setAgentURI`.
- `name`, `description`, `image`.
- `services`: `web` (dashboard), `fx-quotes` (public indicative cross-rate endpoint, free), and later `MCP`.
- `x402Support: false`, `supportedTrust: ["reputation"]`.
- `registrations: [{agentId, agentRegistry: "eip155:42220:0x8004A169…a432"}]`, added after the `Registered` event.

### 5.2 Repo and stack

```
naira-desk/                       (public from day 1; name frozen before enrollment)
├─ apps/
│  ├─ agent/        brain: fair value, skew, regime, risk officer, rebalancer, buy client,
│  │                feed server (Hono), Telegram ops bot (grammY)
│  ├─ indexer/      reactor fill indexer, P&L engine, independence checker
│  └─ dashboard/    Next.js /proof page (Vercel); reads metrics API + links to Celoscan
├─ packages/
│  ├─ chain/        THE tagged wallet client, addresses, ABIs (reactor, ERC-8004, ERC-20, Permit2)
│  ├─ pricing/      source adapters + pure fair-value math (unit-tested, no I/O)
│  └─ shared/       zod config schema, types
├─ infra/
│  ├─ stitch/       stitch.toml per corridor, pinned image tag, patches/erc8021.patch
│  └─ docker-compose.yml   (stitch + agent + indexer; restart: always)
├─ scripts/         register-8004.ts, approve-permit2.ts, verify-tags.ts,
│                   independence-check.ts, export-proof.ts (CSV + recompute P&L from chain)
├─ agent-card/      agent-registration.json
└─ docs/            ARCHITECTURE.md, PNL_METHODOLOGY.md, SOURCING.md (where volume came from),
                    RISK.md (limits, kill switches), THIRD_PARTY.md (Stitch, AGPL, what's not yours)
```

- **Stack:** Node 22 + TypeScript + pnpm workspaces, viem ≥ 2.45, `@celo/attribution-tags`, zod, Hono, better-sqlite3, grammY, Next.js + Recharts.
- **Hosting:** Stitch from its pinned GitHub release or GHCR image, unmodified until the tagging patch. Run everything on one VPS (Hetzner CX22-class, prepaid through 15 Nov) with the Chainstack Celo node (3 months free for teams).
- **LLM:** a small cheap model (Claude Haiku 5.5, `claude-haiku-5-5`, or Cencori through buy if you get beta access). It only classifies news into a regime: normal, caution or halt. It never touches keys or prices directly.

**P&L methodology (publish it):**
- NAV(t) = Σ balances × reference price. The reference is the independent median mid, *not* your own feed.
- P&L = NAV(t) − NAV(0) − net deposits.
- Decompose into **spread capture** (fill price vs. mid at fill time), **inventory revaluation** (FX drift) and **costs** (gas, buy spend, fees on rebalances).
- Strategy P&L must include buy spend. Judges will respect seeing that.

### 5.3 Day-by-day plan: Tue 13 Oct to Fri 30 Oct

Office hours are Thursdays at 12:00 GMT (13:00 Lagos): 15, 22 and 29 Oct.

| Date | Goal | Done when |
|---|---|---|
| **Tue 13** | Unblock the gating items. Pick the repo name, create the public repo, register on loops.house and get the attribution code. **Email Textile** with: maker key for Celo cNGN/USD₮ + wARS, whether limit-order filling needs a key, Operator Vault on Celo, how fills are credited. Post the section 6 questions in Telegram. Create the agent wallet (fresh EOA, never used). Request a Chainstack node. | Code in hand; email sent; questions posted |
| **Wed 14** | Monorepo skeleton. `packages/chain` with the tagged client plus the CI guard. Unit test: suffix decodes with `fromDataSuffix`. Price adapters: Textile tickers and Celo/BSC previews, plus one or two Nigerian sources (check ToS and rate limits). | `pnpm test` green; adapters return prices |
| **Thu 15** | Host the agent card. **Send the first mainnet transaction: `register()` from the agent wallet, tagged.** `verifyTx` returns your code. Check 8004scan. Office hours: confirm the maker-credit and query questions. | Tagged 8004 tx on Celoscan *(target is the 15th; the hard limit is the 16th)* |
| **Fri 16** | Fund the agent wallet: small USD₮ plus cNGN plus CELO for gas. Tagged Permit2 approvals from TS. Bring up Stitch in Docker on Celo with `--dry-run` against your feed server. | Stitch logs "would quote" on Celo |
| **Sat 17** | Fair-value engine: median of sources, outlier rejection, staleness gate (stale means Stitch rejects the feed, which acts as a built-in kill switch). Inventory skew. Per-pool caps (fixed amounts, never `"max"` on two pools). | Feed is stable for 6 hours; skew moves with balance |
| **Sun 18** | **Go live** on cNGN/USD₮ with $50–100 per side *if* you have the maker key. Otherwise go live with limit-order taking (permissionless) once the Stitch tagging patch works. Daily loss limit, Telegram alerts, `/halt` command. | First independent fill on mainnet |
| **Mon 19** | Indexer: reactor fills and agent-wallet transfers into SQLite. P&L engine using the methodology above. **Pivot check:** if there's no maker key and no limit-taker path, escalate with Textile and switch to the fallback (section 5.6). | P&L recomputable from chain |
| **Tue 20** | **Start outreach** (5.4). Proof page v0 live: P&L, volume, fills, counterparties. Generate preferred-liquidity deep links. | Links posted in 3+ communities |
| **Wed 21** | Add wARS/USD₮ (thin corridor), then wBRL. ARS/BRL sources: CriptoYa, dolarapi or BCB (check them). Rebalancer as RFQ taker with `restrictedLiquidityWallets` set to *other* makers (taken from observed fills). Self-trade is impossible by construction. | Fills on 2+ corridors |
| **Thu 22** | Stitch ERC-8021 patch (Rust), if not done Sunday. Turn on the limit taker. Office hours: show the dashboard and ask whether it matches the leaderboard query. | Stitch txs pass `verifyTx` |
| **Fri 23** | **buy integration:** `@celo/buy` (CLI or MCP; confirm a Node API exists). Two uses: X/news search for CBN/naira events every 30–60 minutes, then LLM regime classification. Spend cap $20 total. Every paid call is logged next to the decision it informed. | Paid calls visible with tx hashes |
| **Sat 24** | Counterparty screening via buy (Agent402 address screening), once per new counterparty, cached. The independence checker labels each counterparty (first funder, first tx before 6 Oct). Show "independent: X of Y." | Labels on the dashboard |
| **Sun 25** | Hardening and chaos tests: kill the feed, kill RPC, kill Stitch, drain a pool, simulate a 3% naira gap. Watchdog plus auto-restart. Alert on: no quotes for 30 minutes, NAV drop over X%, stale feed, low gas. | All chaos cases auto-halt or recover |
| **Mon 26** | Tune spreads from fill data (which tiers win and which lose to adverse selection). Write PNL_METHODOLOGY.md and SOURCING.md. | Docs drafted |
| **Tue 27** | Dashboard polish (5.5). `export-proof.ts`: CSV plus a script that recomputes P&L from chain only. | A judge can reproduce the numbers |
| **Wed 28** | README, ARCHITECTURE.md, THIRD_PARTY.md. Record the demo video (3 minutes or less). | Video uploaded (unlisted) |
| **Thu 29** | **Feature freeze.** Final `setAgentURI`. Full `verify-tags` pass. Office hours: dry-run your submission story. | Submission draft complete |
| **Fri 30** | **Submit.** Switch to *autopilot mode*: tighter caps, wider spreads, lower daily loss limit, auto-halt on any anomaly. Prepay VPS and Chainstack. Hand a trusted friend read-only dashboard access. | Submitted; autopilot running |
| Sat 31 | Buffer: fix whatever broke overnight; last check of the leaderboard vs. your dashboard. | |
| 1–9 Nov | You travel. The agent runs. Your only intervention is `/halt` from your phone. Volume and P&L keep accruing to the live query until 9 Nov. | |

### 5.4 Independent counterparty outreach (from 20 Oct; prepare earlier)

Never pay anyone to trade, run rebates, or trade from wallets you funded. That's wash trading and it's detectable. Outreach means *routing real demand*:
1. **Nigerian Celo community:** Celo Africa DAO, Nigerian MiniPay users, Lagos Celo builders. Post: "Need cNGN↔USD₮ on Celo? This link gets you a firm quote with Naira Desk as preferred liquidity." The rate is shown before anyone commits.
2. **Hackathon Telegram:** "LatAm teams: wARS on Textile Celo only has about $6.6k of depth; there's now a second maker." Those teams need wFIAT for their demos anyway.
3. **Textile:** ask to be included in the fan-out and featured as a Celo filler, and ask which aggregators route to Textile on Celo.
4. **FX Remit users:** only if they're real users with existing Celo wallets. Route their conversions through a preferred link and **disclose it in SOURCING.md**.
5. **Nigerian crypto Twitter:** a thread on "an AI agent is now a naira bureau de change, here's its live P&L." The transparency is the hook.

### 5.5 Live metrics page (`/proof`): verifiable in seconds

**Top row, six tiles,** each with a "verify" link:
1. **Net strategy P&L** (USD, mark-to-market) and return on capital.
2. **Volume filled** (onchain; every fill links to Celoscan).
3. **Volume quoted.** From Stitch logs, labeled "self-reported," with a daily hash of the log committed to the repo.
4. **Unique counterparties,** split into independent / unknown / mine (excluded).
5. **Agent transactions tagged:** N/N, via `verifyTx`.
6. **buy spend:** $ and number of calls, each linked to its decision.

**Below the tiles:**
- NAV and inventory over time.
- The agent's mid against Textile, exchange and P2P mids.
- Spread-capture vs. inventory P&L decomposition.
- The regime timeline, with what the risk officer read.
- Kill-switch state.
- Your ERC-8004 identity on 8004scan.

**Footer:**
- The list of wallets you own, published so judges can exclude them.
- `pnpm proof` instructions to recompute everything from chain.
- A link to the official leaderboard for cross-checking.

### 5.6 Risks, pivot triggers and budget

| Risk | Trigger | Response |
|---|---|---|
| No Celo maker key | Not issued by Mon 19 | Limit-order taking only (permissionless, tagged via the patch) and keep escalating with Textile. If that's also blocked, enter Textile as an "agent treasury taker" with transparent P&L vs. a benchmark. Weaker, but honest. |
| Outpriced on cNGN | Under 5 fills by Thu 22 | Move capital to wARS (thin), quote overflow sizes, lean on preferred links |
| Naira gap / adverse selection | NAV −3% in a day | Auto-halt, then flatten inventory via a restricted RFQ to other makers |
| Bug while you travel | Any anomaly | Defaults are fail-closed: halt quoting, never close positions at market automatically |
| Stitch AGPL / "code written during hackathon" | n/a | Stitch is a declared third-party dependency (THIRD_PARTY.md). Your code is the brain, indexer, dashboard and patch. Confirm in Telegram. |

**Budget to ask yourself about now:**
- **Trading float:** $600–1,500 (for example $400 USD₮ + $250 in cNGN for cNGN; $200 USD₮ + $100 wARS for wARS).
- **Fixed costs:** CELO for gas (~$5), buy ~$20, VPS ~$6.
- **Worst-case realistic loss** with the limits above: about 5% of the float. If you can't afford to lose $75, run smaller. Volume will be lower, but the proof page still works.

### 5.7 Submission checklist (complete by Fri 30 Oct)

- [ ] Public repo resolves. The name was never changed after enrollment.
- [ ] Agent wallet added to the entry. ERC-8004 identity registered *from that wallet*, visible on 8004scan, and `agentURI` resolves.
- [ ] `verify-tags`: 100% of agent-sent transactions tagged since the first one.
- [ ] Tracks selected: **Textile FX** (main) and **Build with buy**. Optional: LatAm as closest fit, with a one-line note.
- [ ] README: what it does, how it decides, how to run it, contract addresses, links to `/proof` and 8004scan.
- [ ] ARCHITECTURE.md: the diagram, who pays gas where (agent pays its own; takers pay for fills; the buy gateway sponsors x402), and that Stitch is used for execution.
- [ ] PNL_METHODOLOGY.md, plus `pnpm proof` to recompute from chain.
- [ ] **SOURCING.md, the honest note:** where every counterparty came from (Textile fan-out, deep links, FX Remit with disclosure), your own wallets listed and excluded, and confirmation that no incentives were paid for volume.
- [ ] THIRD_PARTY.md: Stitch (AGPL, pinned version, your patch), buy, Textile APIs.
- [ ] Demo video, 3 minutes or less:
  - (1) The problem in one sentence.
  - (2) A live RFQ arrives, the agent quotes, the taker fills, and the Celoscan transaction appears.
  - (3) The risk officer widens spreads on a news event bought through buy.
  - (4) The proof page.
  - (5) Kill switch from your phone.
- [ ] Autopilot parameters committed; VPS prepaid; alerts tested from your phone.

---

## 6. What I couldn't verify, and the exact questions to ask

**Unverified or missing:**
- x402.celo.org is a JavaScript app and showed no content. I used docs.celo.org plus a live `GET /supported` instead.
- ripio.com and the Celo blog post on Ripio returned 403. I couldn't confirm wMXN, wPEN or wCLP addresses on Celo or how Ripio's ramps work.
- cngn.co has no chain or contract details. The Celo cNGN address comes from Textile's address book: `0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f` (6 decimals).
- The Stitch RFQ maker protocol and its feed's unit conventions. Read `ADVANCED.md` on day 2.
- Whether the Operator Vault factory on Celo is permissionless.
- Celo-only volume per corridor. The tickers look like all chains combined.
- Whether a cNGN bridge exists from Celo to Base or BSC.
- Whether a trailing ERC-8021 suffix on Textile's `executeBatch` calldata is safe. Test it with a $1 rebalance before relying on it.
- Whether buy has a programmatic Node API, and whether Cencori LLM beta access is available.
- Prize eligibility and payout method for Nigeria-based winners.

**Ask in Telegram (t.me/realworldagentshackathon) or at office hours:**
1. "For the **Textile track**, RFQ fills are broadcast by the *taker*, so the fill transaction carries the taker's tag, not the maker's. How does the published query credit a **maker** agent: by order signer/counterparty in the reactor fill matching our registered agent wallet, or by our tag?"
2. "How is **'volume quoted'** measured: Textile's server-side maker quote logs per maker wallet, or something we self-report?"
3. "Is **Strategy P&L** computed by your query (which method and reference prices) or self-reported with a methodology? Over what window: from registration, or from first tagged transaction?"
4. "Is the attribution code issued at enrollment equal to `codeFromRepo(owner/repo)`? If we include both the assigned code and another code in the suffix, is that fine?"
5. "x402 settlements on Celo are untagged until the facilitator ships Schema 2 (x402-rs PR #99). How do the **USA₮/x402** and **buy** queries attribute paid calls: by payer address = registered agent wallet?"
6. "Can we run **Textile's open-source Stitch (AGPL)** as an execution dependency, with our own pricing and risk agent written during the hackathon, plus a small patch to add ERC-8021 tags? Does that satisfy 'code written during the hackathon'?"
7. "Do counterparties need to meet the **independent-user definition** for the Textile track, or only for USA₮/buy? Will maker fills against Textile's anonymous takers count as independent?"
8. "Can one ERC-8004 identity and agent wallet be entered in Textile **and** buy? Is a second operational wallet (for example a separate Stitch signer) allowed if it's linked in the agent card?"
9. "Do submissions stay editable until 9 Nov 09:00 GMT, and do onchain metrics keep counting until then if we submit on 30 Oct?"
10. "Are participants in Nigeria eligible for prizes, and how are prizes paid?"

**Ask Textile (contact@textilecredit.com, today):**
1. "Can a new solo operator get a **live maker key for Celo** (cNGN/USD₮, wARS/USD₮, wBRL/USD₮) this week, and what's required?"
2. "Is **limit-order filling** through Stitch's `limit_taker_enabled` permissionless on Celo, or does it need a key or indexer access?"
3. "Can we deploy an **Operator Vault** on Celo (cNGN/USD₮) ourselves through the factory? What minimums, epoch lengths and risk-key setup apply?"
4. "Would you accept a PR adding ERC-8021 calldata tagging to Stitch?"
5. "Any plan to add **Celo (42220)** to the Busha NGN ramp? Is there a recommended cNGN bridge from Celo?"

---

## 7. Sources

- Hackathon rules, tracks and judging: https://www.loops.house/agents-on-open-rails
- ERC-8004 on Celo: https://docs.celo.org/build-on-celo/build-with-ai/8004
- x402 on Celo (docs): https://docs.celo.org/build-on-celo/build-with-ai/x402 · live: `https://api.x402.celo.org/supported`
- Attribution tags: https://github.com/celo-org/attribution-tags · BUILDERS.md · sdk/README.md
- buy skills: https://github.com/celo-org/buy-skill · catalog: https://usebuy.ai
- Textile FX docs: https://docs.textilecredit.com/ (how-it-works, fees, address book, API v2 RFQ, auth, Ramp, filler guide, Operator Vault, preferred liquidity)
- Textile live data: `https://api.textilecredit.com/tickers`, `/v2/rfq/preview`, `/v2/ramp/providers` (queried 13 Oct 2026)
- Stitch: https://github.com/textile-protocol/textile-stitch
- USA₮ on Celo: https://docs.celo.org/build-on-celo/build-with-usat
- cNGN: https://cngn.co · https://blog.celo.org/cngn-deploys-on-celo-bringing-the-nigerian-naira-to-the-leading-stablecoin-networks-onchain-fx-f2b570a079da
- Ripio wFIAT on Celo (coverage): https://blockchain.news/news/ripio-wfiat-stablecoins-celo-integration
