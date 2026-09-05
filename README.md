# 🍪 Cookie Drop

Batch airdrops on [Cookie Chain](https://www.cookiechain.wtf). Paste a list of
addresses, check it, send once.

**Live app:** https://hllerdgn80-code.github.io/cookie-drop/
**Network:** Cookie Chain (SVM) · RPC `https://rpc.cookiescan.io` · explorer [Cookiescan](https://cookiescan.io)

---

## Why this exists

Cookie Chain is a memetic SVM — the things people actually do on it are launch
tokens and hand them out. Handing them out is where it goes wrong. Sending the
same token to 300 wallets by hand means 300 approval prompts, and the failures
are quiet ones: a mistyped address that eats a transaction fee, a duplicate row
that pays someone twice, a recipient who has never held the token and whose
transfer fails because nobody created their token account.

Cookie Drop does that job properly:

- **Nothing is sent until the list is clean.** Every address is checked against
  the ed25519 curve, every amount against the token's real decimal precision.
  Bad lines are reported with their line number rather than skipped silently.
- **Duplicates are surfaced, not merged.** If an address appears twice, you are
  told which lines — and it is still paid twice, because merging someone's rows
  behind their back is its own bug.
- **Missing token accounts are created in the same transaction.** The app checks
  every recipient's associated token account up front and folds an idempotent
  create instruction into the batch where one is needed.
- **One approval for the whole run.** Wallets that implement
  `signAllTransactions` — Nightly does — sign every batch in a single prompt.
- **A failed batch costs one retry, not the drop.** Each batch confirms
  independently and records its own signature or error; the send button turns
  into "Retry N failed" and leaves the confirmed ones alone.
- **You get a receipt.** Export a CSV of every address, amount, batch, status
  and signature.

## Screens

The flow is four panels: wallet, what you're sending, who receives it, and a
check-and-send step that shows each transaction confirming with a link to
Cookiescan.

## How it works

Cookie Chain is Solana-compatible, so this is ordinary Solana client code with
one endpoint changed. That fact is confined to [`src/chain.ts`](src/chain.ts);
nothing else in the app knows it is not on Solana.

| Concern | Where | Notes |
|---|---|---|
| Connection + explorer links | `src/chain.ts` | The only file naming Cookie Chain endpoints |
| Wallet's token list | `src/das.ts` | Cookiescan's Metaplex DAS indexer (`getAssetsByOwner`) |
| Parsing, validation, batching | `src/recipients.ts` | Pure functions, no wallet, no network — unit tested |
| Account checks + sending | `src/airdrop.ts` | ATA lookup, instruction building, confirmation |
| UI | `src/App.tsx` | Four panels, one flow |

Supported assets: native **COOK**, plus any **SPL Token** or **Token-2022** the
connected wallet holds. The token program is detected per mint rather than
assumed.

### Amounts are computed in integers

`parseFloat("0.1") * 1e9` is `100000000.00000001`. An airdrop built on floating
point rounds unpredictably across thousands of rows, and the error lands in
somebody's balance. `toBaseUnits` does the conversion on strings and returns a
`bigint`, so a thousand rows of `0.1` sum to exactly `100`. There is a test for
precisely that.

### Batch sizes are derived, not guessed

A Solana transaction is capped at 1232 bytes, so how many transfers fit is a
function of instruction count. Recipients who need a token account cost two
instructions instead of one, so `planBatches` weights them double — a batch of
fresh wallets is half the size of a batch of known ones.

## Run it locally

```bash
npm install
npm run dev            # http://localhost:5173/cookie-drop/
npm test               # 20 unit tests, no network needed
npm run build          # production bundle into dist/
```

No environment variables and no API keys: the RPC and the DAS indexer are both
public.

## Using it

1. Install [Nightly](https://nightly.app) and point it at Cookie Chain
   (custom SVM network, RPC `https://rpc.cookiescan.io`). Bridge in a little
   COOK for fees — see the [Cookie Chain Bridge](https://www.cookiechain.wtf).
2. Open the app and connect.
3. Pick COOK or one of your tokens.
4. Paste your list — `address,amount` per line. Commas, spaces and tabs all
   work; `#` comments and a CSV header row are ignored. Or upload a `.csv`.
5. **Check recipients.** This reads the chain and tells you how many recipients
   need a token account created, and how many transactions the drop will take.
   Nothing has been spent at this point.
6. **Send.** Approve once, then watch the batches confirm.
7. Download the receipt.

### Costs

You pay the transaction fees, and rent for any associated token account the drop
creates (roughly 0.002 COOK each, refundable by the recipient if they ever close
the account). The app tells you how many it will create before you send.

## Tests

```
npm test
```

20 tests over the logic that decides whether someone loses money: address
validation, integer amount conversion, round-tripping, precision limits,
duplicate detection, line-accurate error reporting, and batch planning
(including that batching never drops or duplicates a row).

## Built with

React + TypeScript + Vite · `@solana/web3.js` · `@solana/spl-token` ·
`@solana/wallet-adapter-*` (Nightly) · Cookiescan DAS API

## Licence

MIT
