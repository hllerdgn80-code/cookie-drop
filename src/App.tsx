import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  NATIVE_DECIMALS,
  NATIVE_SYMBOL,
  addrUrl,
  short,
  txUrl,
} from "./chain";
import { getFungibleTokens, type TokenHolding } from "./das";
import {
  fromBaseUnits,
  parseRecipients,
  totalBaseUnits,
  type ParseResult,
} from "./recipients";
import {
  planDrop,
  prepareRows,
  runDrop,
  type Asset,
  type Batch,
  type PreparedRow,
} from "./airdrop";

const SAMPLE = `# One recipient per line: address,amount
# Comma, space or tab all work. Lines starting with # are ignored.
9wDaBRDgArEUpvhHxGguNkwozsZh4UpGZB9o2EoEcBB2,1.5
TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA,0.25`;

export default function App() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, signAllTransactions, connected } = useWallet();

  const [balance, setBalance] = useState<number | null>(null);
  const [tokens, setTokens] = useState<TokenHolding[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [assetKey, setAssetKey] = useState<string>("native");
  const [text, setText] = useState("");
  const [prepared, setPrepared] = useState<PreparedRow[] | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* ---------------------------------------------------------------- wallet */

  const refresh = useCallback(async () => {
    if (!publicKey) return;
    setError(null);
    try {
      setBalance(await connection.getBalance(publicKey));
    } catch (err) {
      setError(`Could not read your ${NATIVE_SYMBOL} balance: ${(err as Error).message}`);
    }
    setLoadingTokens(true);
    try {
      setTokens(await getFungibleTokens(publicKey.toBase58()));
    } catch (err) {
      // A DAS outage must not block a native drop, so this is a notice only.
      setError(`Token list unavailable (${(err as Error).message}). ${NATIVE_SYMBOL} drops still work.`);
    } finally {
      setLoadingTokens(false);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    if (connected) refresh();
    else {
      setBalance(null);
      setTokens([]);
      setPrepared(null);
      setBatches([]);
    }
  }, [connected, refresh]);

  /* ----------------------------------------------------------------- asset */

  const asset: Asset | null = useMemo(() => {
    if (assetKey === "native") return { kind: "native", decimals: NATIVE_DECIMALS };
    const t = tokens.find((x) => x.mint === assetKey);
    return t
      ? { kind: "spl", mint: t.mint, decimals: t.decimals, programId: t.programId ?? "" }
      : null;
  }, [assetKey, tokens]);

  const held = useMemo(() => {
    if (!asset) return 0n;
    if (asset.kind === "native") return BigInt(balance ?? 0);
    return tokens.find((t) => t.mint === asset.mint)?.amount ?? 0n;
  }, [asset, balance, tokens]);

  const symbol =
    asset?.kind === "native"
      ? NATIVE_SYMBOL
      : tokens.find((t) => t.mint === assetKey)?.symbol ||
        tokens.find((t) => t.mint === assetKey)?.name ||
        "tokens";

  /* ------------------------------------------------------------ recipients */

  const parsed: ParseResult = useMemo(() => parseRecipients(text), [text]);

  const total = useMemo(() => {
    if (!asset) return 0n;
    try {
      return totalBaseUnits(parsed.rows, asset.decimals);
    } catch {
      return -1n; // an amount exceeds the token's precision
    }
  }, [parsed.rows, asset]);

  const overBalance = total > 0n && total > held;
  const canPrepare =
    connected && !!asset && parsed.rows.length > 0 && total > 0n && !busy;

  /* -------------------------------------------------------------- actions */

  async function handlePrepare() {
    if (!asset) return;
    setError(null);
    setBatches([]);
    setBusy("Checking recipient accounts…");
    try {
      const rows = await prepareRows(parsed.rows, asset, (done, all) =>
        setBusy(`Checking recipient accounts… ${done}/${all}`),
      );
      setPrepared(rows);
      setBatches(planDrop(rows, asset));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleSend() {
    if (!asset || !publicKey || batches.length === 0) return;
    setError(null);
    setBusy("Waiting for your wallet…");
    try {
      await runDrop({
        payer: publicKey,
        asset,
        batches,
        signAllTransactions,
        sendTransaction: (tx) => sendTransaction(tx, connection),
        onUpdate: () => setBatches((prev) => [...prev]),
      });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function downloadReceipt() {
    const lines = ["address,amount,batch,status,signature"];
    batches.forEach((b) =>
      b.rows.forEach((r) =>
        lines.push(
          [r.address, r.amount, b.index + 1, b.status, b.signature ?? ""].join(","),
        ),
      ),
    );
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `cookie-drop-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const done = batches.filter((b) => b.status === "confirmed").length;
  const failed = batches.filter((b) => b.status === "failed").length;
  const newAccounts = prepared?.filter((r) => r.needsAccount).length ?? 0;

  /* ------------------------------------------------------------------- ui */

  return (
    <div className="wrap">
      <header className="top">
        <span className="logo">🍪</span>
        <div>
          <h1>Cookie Drop</h1>
          <div className="sub">Batch airdrops on Cookie Chain — paste a list, send once.</div>
        </div>
        <div className="spacer" />
        <WalletMultiButton />
      </header>

      {!connected && (
        <div className="panel">
          <h2>Get started</h2>
          <p className="note">
            Connect a Solana-compatible wallet to begin. Cookie Chain documents{" "}
            <a href="https://nightly.app" target="_blank" rel="noreferrer">Nightly</a>{" "}
            as fully supported — point it at <code>https://rpc.cookiescan.io</code> and it
            behaves like any other SVM network.
          </p>
          <p className="note">
            Cookie Drop sends the same token to many addresses in as few transactions as the
            chain allows, checks every address before you spend anything, and shows you each
            transaction as it confirms.
          </p>
        </div>
      )}

      {connected && publicKey && (
        <>
          <div className="panel">
            <h2>Wallet</h2>
            <div className="grid">
              <div className="stat">
                <div className="k">Address</div>
                <div className="v mono">
                  <a href={addrUrl(publicKey.toBase58())} target="_blank" rel="noreferrer">
                    {short(publicKey.toBase58(), 6)}
                  </a>
                </div>
              </div>
              <div className="stat">
                <div className="k">{NATIVE_SYMBOL} balance</div>
                <div className="v">
                  {balance === null ? "…" : (balance / LAMPORTS_PER_SOL).toLocaleString(undefined, { maximumFractionDigits: 6 })}
                </div>
              </div>
              <div className="stat">
                <div className="k">Tokens held</div>
                <div className="v">{loadingTokens ? "…" : tokens.length}</div>
              </div>
              <div className="stat">
                <div className="k">Network</div>
                <div className="v">Cookie Chain</div>
              </div>
            </div>
          </div>

          <div className="panel">
            <h2>1 · What are you sending?</h2>
            <select value={assetKey} onChange={(e) => { setAssetKey(e.target.value); setPrepared(null); setBatches([]); }}>
              <option value="native">
                {NATIVE_SYMBOL} (native) — {balance === null ? "…" : fromBaseUnits(BigInt(balance), NATIVE_DECIMALS)} available
              </option>
              {tokens.map((t) => (
                <option key={t.mint} value={t.mint}>
                  {t.symbol || t.name} — {fromBaseUnits(t.amount, t.decimals)} available
                </option>
              ))}
            </select>
            {asset?.kind === "spl" && (
              <p className="note" style={{ marginBottom: 0 }}>
                Mint <code>{asset.mint}</code> · {asset.decimals} decimals
              </p>
            )}
          </div>

          <div className="panel">
            <h2>2 · Who receives it?</h2>
            <textarea
              value={text}
              placeholder={SAMPLE}
              spellCheck={false}
              onChange={(e) => { setText(e.target.value); setPrepared(null); setBatches([]); }}
            />
            <div className="row" style={{ marginTop: 10 }}>
              <label className="ghost" style={{ display: "inline-block" }}>
                <button className="ghost" type="button"
                  onClick={() => document.getElementById("csv")?.click()}>
                  Upload CSV
                </button>
              </label>
              <input id="csv" type="file" accept=".csv,.txt" style={{ display: "none" }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) { setText(await file.text()); setPrepared(null); setBatches([]); }
                }} />
              <button className="ghost" type="button" onClick={() => setText(SAMPLE)}>
                Insert example
              </button>
              <span className="note">
                {parsed.rows.length} valid {parsed.rows.length === 1 ? "recipient" : "recipients"}
                {parsed.issues.length > 0 && ` · ${parsed.issues.length} skipped`}
              </span>
            </div>

            {parsed.issues.length > 0 && (
              <ul className="issues plain">
                {parsed.issues.slice(0, 8).map((i) => (
                  <li key={i.line}>Line {i.line}: {i.reason}</li>
                ))}
                {parsed.issues.length > 8 && <li>…and {parsed.issues.length - 8} more</li>}
              </ul>
            )}

            {parsed.duplicates.size > 0 && (
              <ul className="issues dupes plain">
                {[...parsed.duplicates.entries()].slice(0, 5).map(([addr, lines]) => (
                  <li key={addr}>
                    {short(addr, 6)} appears on lines {lines.join(", ")} — it will be paid once per line.
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel">
            <h2>3 · Check and send</h2>
            <div className="grid">
              <div className="stat">
                <div className="k">Recipients</div>
                <div className="v">{parsed.rows.length}</div>
              </div>
              <div className="stat">
                <div className="k">Total to send</div>
                <div className="v">
                  {total < 0n ? "—" : `${fromBaseUnits(total, asset?.decimals ?? 9)} ${symbol}`}
                </div>
              </div>
              <div className="stat">
                <div className="k">You hold</div>
                <div className="v">{fromBaseUnits(held, asset?.decimals ?? 9)} {symbol}</div>
              </div>
              <div className="stat">
                <div className="k">Transactions</div>
                <div className="v">{batches.length || "—"}</div>
              </div>
            </div>

            {total < 0n && (
              <p className="err">
                One of the amounts has more decimal places than this token supports.
              </p>
            )}
            {overBalance && (
              <p className="err">
                This drop needs {fromBaseUnits(total - held, asset?.decimals ?? 9)} {symbol} more
                than you hold. Nothing has been sent.
              </p>
            )}
            {prepared && newAccounts > 0 && (
              <p className="note">
                {newAccounts} {newAccounts === 1 ? "recipient has" : "recipients have"} no account for
                this token yet — Cookie Drop creates {newAccounts === 1 ? "it" : "them"} in the same
                transaction. That costs a small amount of {NATIVE_SYMBOL} in rent, paid by you.
              </p>
            )}

            <div className="row" style={{ marginTop: 14 }}>
              <button onClick={handlePrepare} disabled={!canPrepare}>
                {prepared ? "Re-check recipients" : "Check recipients"}
              </button>
              <button
                onClick={handleSend}
                disabled={!prepared || batches.length === 0 || overBalance || !!busy || done === batches.length}
              >
                {failed > 0 ? `Retry ${failed} failed` : `Send ${batches.length || ""} transaction${batches.length === 1 ? "" : "s"}`}
              </button>
              {batches.length > 0 && (
                <button className="ghost" onClick={downloadReceipt}>Download receipt</button>
              )}
              {busy && <span className="note">{busy}</span>}
            </div>
            {error && <p className="err">{error}</p>}
          </div>

          {batches.length > 0 && (
            <div className="panel">
              <h2>Progress — {done}/{batches.length} confirmed{failed > 0 ? `, ${failed} failed` : ""}</h2>
              <div className="bar">
                <span style={{ width: `${(done / batches.length) * 100}%` }} />
              </div>
              <table>
                <thead>
                  <tr><th>#</th><th>Recipients</th><th>Amount</th><th>Status</th><th>Transaction</th></tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.index}>
                      <td>{b.index + 1}</td>
                      <td>{b.rows.length}</td>
                      <td>
                        {fromBaseUnits(
                          b.rows.reduce((s, r) => s + r.units, 0n),
                          asset?.decimals ?? 9,
                        )}
                      </td>
                      <td>
                        <span className={`pill ${b.status}`}>{b.status}</span>
                        {b.error && <div className="err">{b.error}</div>}
                      </td>
                      <td className="mono">
                        {b.signature ? (
                          <a href={txUrl(b.signature)} target="_blank" rel="noreferrer">
                            {short(b.signature, 6)}
                          </a>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <footer>
        Open source ·{" "}
        <a href="https://github.com/hllerdgn80-code/cookie-drop" target="_blank" rel="noreferrer">GitHub</a>{" "}
        · built on{" "}
        <a href="https://www.cookiechain.wtf" target="_blank" rel="noreferrer">Cookie Chain</a>{" "}
        · explorer <a href="https://cookiescan.io" target="_blank" rel="noreferrer">Cookiescan</a>
      </footer>
    </div>
  );
}
