<<POST 1>>
Cookie Drop — batch airdrops on @TheCookieChain.

Paste a list of addresses, check it, send once.

It validates every recipient before you spend anything, packs the transfers into as few transactions as the chain allows, and shows each one confirming 🧵
<<END>>
<<POST 2>>
Handing a token to 300 wallets by hand means 300 approval prompts — and the failures are the quiet kind.

A mistyped address burns a fee. A duplicated row pays someone twice. A wallet that never held the token fails outright, because nobody created its token account.
<<END>>
<<POST 3>>
So nothing sends until the list is clean:

• every address checked against the ed25519 curve
• every amount checked against the token's real decimals
• bad lines reported by line number, never skipped silently
• duplicates surfaced with the lines they came from
<<END>>
<<POST 4>>
Two things that save a drop:

Recipients with no token account are found up front, and creating it is folded into the same transaction as the transfer.

And wallets implementing signAllTransactions — Nightly does — sign the entire run in one prompt.
<<END>>
<<POST 5>>
Each batch confirms on its own, so one expired blockhash costs a single retry instead of the whole drop. The button becomes "Retry 3 failed" and leaves the confirmed batches alone.

Afterwards you export a CSV: every address, amount, status and signature.
<<END>>
<<POST 6>>
How to use it:

1. Install Nightly, add Cookie Chain — RPC https://rpc.cookiescan.io
2. Bridge in some COOK for fees: https://www.cookiechain.wtf
3. Pick COOK or any token you hold
4. Paste address,amount per line
5. Check, then send
<<END>>
<<POST 7>>
Open source, MIT, no API keys — the RPC and the Cookiescan DAS indexer are both public.

App → https://hllerdgn80-code.github.io/cookie-drop/
Code → https://github.com/hllerdgn80-code/cookie-drop

Built on @TheCookieChain 🍪
<<END>>
