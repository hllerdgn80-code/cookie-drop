# Cookie Drop — where things stand

**Bounty:** Create an App on Cookie Chain (Superteam Earn)
500 + 500 USDC · two equal prizes · deadline 22 Sep 2026 21:59 UTC

## Done

- **Live app:** https://hllerdgn80-code.github.io/cookie-drop/ (GitHub Pages, HTTP 200, renders with no console errors)
- **Public repo:** https://github.com/hllerdgn80-code/cookie-drop
- **Tests:** 20 passing (`npm test`) over address validation, integer amount
  conversion, precision limits, duplicate detection, line-accurate error
  reporting and batch planning
- **Build:** clean `tsc --noEmit`, production bundle 696 KB / 214 KB gzipped
- **README:** setup, architecture table, cost explanation, usage walkthrough
- **X thread post 1 of 7:** https://x.com/Hllerdgn80/status/2096109599337966684

## Remaining

1. **Post 2–7 of the X thread** — full text in `docs/X_THREAD.md`, each already
   under 280 characters. Reply them in order to post 1. X stopped serving pages
   partway through, most likely rate limiting after a burst of posting; retry
   later rather than fighting it.
2. **Submit on Superteam** — listing `create-an-app-on-cookie-chain-app`.
   Fields: live app URL, GitHub repo URL, X thread link. Costs 1 credit, and
   1 credit is what the account has left. Submissions stay editable until the
   deadline, so the thread link can be added after.
3. **Share the thread in the Cookie Chain Telegram** — https://t.me/TheCookieNetChain
   (the listing names this as the final step).

## Not verified end-to-end

The app has not executed a real transfer, because that needs a Nightly wallet
holding COOK and only the account owner can fund one. Everything up to the point
of signing is exercised: wallet connection, token listing from the Cookiescan
DAS indexer, recipient validation, associated-token-account lookup against the
live RPC, and batch planning. The send path itself is the one thing still
unproven against the chain — worth a small real drop before submitting, if COOK
is available.
