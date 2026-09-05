/**
 * Building and sending the airdrop.
 *
 * Two things drive the design here:
 *
 * 1. **One approval, many transactions.** Signing 40 batches one prompt at a
 *    time is how people give up halfway through a drop. Wallets that implement
 *    `signAllTransactions` (Nightly does) let the user approve the whole run
 *    once, so the confirmation UI is the only thing they watch afterwards.
 *
 * 2. **A batch that fails must not poison the rest.** Each batch is sent and
 *    confirmed independently and records its own outcome, so a single expired
 *    blockhash costs one retry rather than the whole drop.
 */
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { connection, NATIVE_DECIMALS } from "./chain";
import { planBatches, toBaseUnits, type Row } from "./recipients";

/** `null` mint means the chain's native token (COOK). */
export type Asset =
  | { kind: "native"; decimals: number }
  | { kind: "spl"; mint: string; decimals: number; programId: string };

export interface PreparedRow extends Row {
  units: bigint;
  /** True when the recipient has no token account for this mint yet. */
  needsAccount?: boolean;
}

export type BatchStatus = "pending" | "sending" | "confirmed" | "failed";

export interface Batch {
  index: number;
  rows: PreparedRow[];
  status: BatchStatus;
  signature?: string;
  error?: string;
}

const MEMO_LIMIT = 10;

function tokenProgram(asset: Asset): PublicKey {
  if (asset.kind === "native") return TOKEN_PROGRAM_ID;
  return asset.programId === TOKEN_2022_PROGRAM_ID.toBase58()
    ? TOKEN_2022_PROGRAM_ID
    : TOKEN_PROGRAM_ID;
}

/**
 * Work out which recipients still need a token account.
 *
 * This costs one RPC round trip per 100 recipients and saves the drop from the
 * most common failure mode: transferring to a wallet that has never held the
 * token, which fails unless the account is created in the same transaction.
 */
export async function prepareRows(
  rows: Row[],
  asset: Asset,
  onProgress?: (done: number, total: number) => void,
): Promise<PreparedRow[]> {
  const prepared: PreparedRow[] = rows.map((row) => ({
    ...row,
    units: toBaseUnits(row.amount, asset.decimals),
  }));

  if (asset.kind === "native") return prepared;

  const mint = new PublicKey(asset.mint);
  const program = tokenProgram(asset);
  const addresses = prepared.map((row) =>
    getAssociatedTokenAddressSync(mint, new PublicKey(row.address), true, program),
  );

  for (let i = 0; i < addresses.length; i += 100) {
    const slice = addresses.slice(i, i + 100);
    const infos = await connection.getMultipleAccountsInfo(slice);
    infos.forEach((info, j) => {
      prepared[i + j].needsAccount = info === null;
    });
    onProgress?.(Math.min(i + 100, addresses.length), addresses.length);
  }
  return prepared;
}

/** Group prepared rows into the transactions that will actually be sent. */
export function planDrop(rows: PreparedRow[], asset: Asset): Batch[] {
  // Native transfers are one small instruction each and pack far tighter than
  // token transfers, which may also carry an account creation.
  const weight = asset.kind === "native" ? 18 : MEMO_LIMIT;
  return planBatches(rows, weight).map((batch, index) => ({
    index,
    rows: batch,
    status: "pending" as BatchStatus,
  }));
}

function instructionsFor(
  batch: Batch,
  asset: Asset,
  payer: PublicKey,
): TransactionInstruction[] {
  const ix: TransactionInstruction[] = [];

  if (asset.kind === "native") {
    for (const row of batch.rows) {
      ix.push(
        SystemProgram.transfer({
          fromPubkey: payer,
          toPubkey: new PublicKey(row.address),
          lamports: row.units,
        }),
      );
    }
    return ix;
  }

  const mint = new PublicKey(asset.mint);
  const program = tokenProgram(asset);
  const source = getAssociatedTokenAddressSync(mint, payer, true, program);

  for (const row of batch.rows) {
    const owner = new PublicKey(row.address);
    const destination = getAssociatedTokenAddressSync(mint, owner, true, program);
    if (row.needsAccount) {
      // Idempotent: safe if another batch (or another person) created it first.
      ix.push(
        createAssociatedTokenAccountIdempotentInstruction(
          payer,
          destination,
          owner,
          mint,
          program,
        ),
      );
    }
    ix.push(
      createTransferCheckedInstruction(
        source,
        mint,
        destination,
        payer,
        row.units,
        asset.decimals,
        [],
        program,
      ),
    );
  }
  return ix;
}

export interface SendOptions {
  payer: PublicKey;
  asset: Asset;
  batches: Batch[];
  signAllTransactions?: (txs: Transaction[]) => Promise<Transaction[]>;
  sendTransaction: (tx: Transaction) => Promise<string>;
  onUpdate: (batch: Batch) => void;
}

/**
 * Execute the drop.
 *
 * Returns the batches in their final state; the caller re-renders from
 * `onUpdate` as each one settles.
 */
export async function runDrop({
  payer,
  asset,
  batches,
  signAllTransactions,
  sendTransaction,
  onUpdate,
}: SendOptions): Promise<Batch[]> {
  const pending = batches.filter((b) => b.status !== "confirmed");

  const build = async (batch: Batch) => {
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction();
    // A small priority fee keeps batches landing when the chain is busy; on a
    // sub-second network the cost is negligible and the failure it prevents
    // is not.
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }));
    tx.add(...instructionsFor(batch, asset, payer));
    tx.feePayer = payer;
    tx.recentBlockhash = blockhash;
    return { tx, lastValidBlockHeight, blockhash };
  };

  // Batch-sign when the wallet supports it: one prompt for the whole run.
  if (signAllTransactions && pending.length > 1) {
    const built = [];
    for (const batch of pending) built.push({ batch, ...(await build(batch)) });

    let signed: Transaction[];
    try {
      signed = await signAllTransactions(built.map((b) => b.tx));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      for (const { batch } of built) {
        batch.status = "failed";
        batch.error = message;
        onUpdate(batch);
      }
      return batches;
    }

    for (let i = 0; i < signed.length; i += 1) {
      const { batch, lastValidBlockHeight, blockhash } = built[i];
      batch.status = "sending";
      onUpdate(batch);
      try {
        const signature = await connection.sendRawTransaction(signed[i].serialize(), {
          maxRetries: 3,
        });
        batch.signature = signature;
        onUpdate(batch);
        const result = await connection.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          "confirmed",
        );
        if (result.value.err) throw new Error(JSON.stringify(result.value.err));
        batch.status = "confirmed";
        batch.error = undefined;
      } catch (err) {
        batch.status = "failed";
        batch.error = err instanceof Error ? err.message : String(err);
      }
      onUpdate(batch);
    }
    return batches;
  }

  // Fallback: one prompt per batch.
  for (const batch of pending) {
    batch.status = "sending";
    onUpdate(batch);
    try {
      const { tx } = await build(batch);
      const signature = await sendTransaction(tx);
      batch.signature = signature;
      onUpdate(batch);
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      const result = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );
      if (result.value.err) throw new Error(JSON.stringify(result.value.err));
      batch.status = "confirmed";
      batch.error = undefined;
    } catch (err) {
      batch.status = "failed";
      batch.error = err instanceof Error ? err.message : String(err);
    }
    onUpdate(batch);
  }
  return batches;
}
