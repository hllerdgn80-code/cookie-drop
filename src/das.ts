/**
 * Cookiescan DAS client — the wallet's token list.
 *
 * Cookie Chain runs a Metaplex Digital Asset Standard indexer, which is the
 * only practical way to get a wallet's fungible holdings *with names and
 * decimals* in one call. Reading it straight off the RPC would mean one
 * `getTokenAccountsByOwner` plus a mint lookup and a metadata lookup per token.
 */
import { DAS_URL } from "./chain";

export interface TokenHolding {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  /** Raw base-unit balance held by the owner. */
  amount: bigint;
  /** Owning token program — SPL Token or Token-2022. */
  programId?: string;
  image?: string;
}

interface DasAsset {
  id: string;
  interface?: string;
  content?: { metadata?: { name?: string; symbol?: string }; links?: { image?: string } };
  token_info?: {
    balance?: number | string;
    decimals?: number;
    symbol?: string;
    token_program?: string;
  };
}

async function rpc<T>(method: string, params: unknown): Promise<T> {
  const res = await fetch(DAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "cookie-drop", method, params }),
  });
  if (!res.ok) throw new Error(`DAS ${method}: HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`DAS ${method}: ${json.error.message ?? "unknown error"}`);
  return json.result as T;
}

/**
 * Every fungible token the owner holds, largest balance first.
 *
 * Zero balances are dropped: they are token accounts left behind by past
 * transfers and picking one would only produce an airdrop that cannot fund
 * itself.
 */
export async function getFungibleTokens(owner: string): Promise<TokenHolding[]> {
  const result = await rpc<{ items: DasAsset[] }>("getAssetsByOwner", {
    ownerAddress: owner,
    page: 1,
    limit: 200,
    displayOptions: { showFungible: true, showZeroBalance: false },
  });

  return (result.items ?? [])
    .filter((a) => a.interface === "FungibleToken" || a.interface === "FungibleAsset")
    .map((a) => {
      const info = a.token_info ?? {};
      const decimals = info.decimals ?? 0;
      return {
        mint: a.id,
        name: a.content?.metadata?.name?.trim() || a.id.slice(0, 8),
        symbol: (a.content?.metadata?.symbol || info.symbol || "").trim(),
        decimals,
        amount: BigInt(info.balance ?? 0),
        programId: info.token_program,
        image: a.content?.links?.image,
      };
    })
    .filter((t) => t.amount > 0n)
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));
}
