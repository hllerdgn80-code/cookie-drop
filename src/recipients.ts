/**
 * Parsing and validation for the recipient list.
 *
 * This is the part of an airdrop tool that actually decides whether someone
 * loses money. A malformed address costs a failed transaction; a duplicated one
 * silently double-pays; a misread decimal sends 1000x the intended amount. So
 * all of it lives here as pure functions with no wallet, no network and no
 * React — which is what makes it unit-testable, and what the tests at
 * `recipients.test.ts` cover.
 */
import { PublicKey } from "@solana/web3.js";

export interface Row {
  /** 1-based line number in the original input, for error messages. */
  line: number;
  address: string;
  /** Human-readable amount exactly as typed, e.g. "1.25". */
  amount: string;
}

export interface ParseIssue {
  line: number;
  raw: string;
  reason: string;
}

export interface ParseResult {
  rows: Row[];
  issues: ParseIssue[];
  /** Addresses that appear more than once, with the lines they appear on. */
  duplicates: Map<string, number[]>;
}

/** A Cookie Chain address is a Solana address: base58, on the ed25519 curve. */
export function isValidAddress(value: string): boolean {
  try {
    // Constructing throws on bad base58 or wrong length.
    const key = new PublicKey(value);
    return key.toBase58() === value;
  } catch {
    return false;
  }
}

/**
 * Convert a decimal string to base units without floating point.
 *
 * `parseFloat("0.1") * 1e9` is 100000000.00000001 — an airdrop built on that
 * rounds unpredictably across thousands of rows. String maths keeps every
 * amount exact.
 */
export function toBaseUnits(amount: string, decimals: number): bigint {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`"${amount}" is not a positive decimal number`);
  }
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) {
    throw new Error(
      `"${amount}" has ${fraction.length} decimal places but this token only supports ${decimals}`,
    );
  }
  const padded = fraction.padEnd(decimals, "0");
  return BigInt(whole + padded);
}

/** Render base units back to a human decimal string, trimming trailing zeros. */
export function fromBaseUnits(units: bigint, decimals: number): string {
  const negative = units < 0n;
  const value = negative ? -units : units;
  const s = value.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals);
  const fraction = s.slice(s.length - decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/**
 * Parse pasted text or an uploaded CSV.
 *
 * Accepts `address,amount`, `address amount` or `address<tab>amount`, ignores
 * blank lines and `#` comments, and skips a header row if the file has one.
 * Every rejected line is reported rather than dropped — silently ignoring a
 * line is how a recipient gets missed without anyone noticing.
 */
export function parseRecipients(input: string): ParseResult {
  const rows: Row[] = [];
  const issues: ParseIssue[] = [];
  const seen = new Map<string, number[]>();

  input.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const text = raw.trim();
    if (!text || text.startsWith("#")) return;

    const parts = text.split(/[,\t ]+/).filter(Boolean);
    if (parts.length < 2) {
      // A header like "address,amount" trips this; report it as a skipped
      // header rather than an error the user has to hunt down.
      issues.push({
        line,
        raw: text,
        reason:
          parts.length === 1 && !isValidAddress(parts[0])
            ? "expected an address and an amount on the same line"
            : "missing amount",
      });
      return;
    }

    const [address, amount] = parts;
    if (/^address$/i.test(address)) return; // CSV header row

    if (!isValidAddress(address)) {
      issues.push({ line, raw: text, reason: `"${address}" is not a valid address` });
      return;
    }
    if (!/^\d+(\.\d+)?$/.test(amount)) {
      issues.push({ line, raw: text, reason: `"${amount}" is not a positive number` });
      return;
    }
    if (Number(amount) === 0) {
      issues.push({ line, raw: text, reason: "amount is zero" });
      return;
    }

    rows.push({ line, address, amount });
    seen.set(address, [...(seen.get(address) ?? []), line]);
  });

  const duplicates = new Map(
    [...seen.entries()].filter(([, lines]) => lines.length > 1),
  );
  return { rows, issues, duplicates };
}

/** Total of every parsed row, in base units. Throws on the first bad amount. */
export function totalBaseUnits(rows: Row[], decimals: number): bigint {
  return rows.reduce((sum, row) => sum + toBaseUnits(row.amount, decimals), 0n);
}

/**
 * Split rows into per-transaction batches.
 *
 * A Solana transaction is capped at 1232 bytes, so the batch size is bounded by
 * instruction count, not by anything we choose freely. Recipients that still
 * need a token account cost a second instruction each, so they are counted
 * double — a batch of fresh wallets is half the size of a batch of known ones.
 */
export function planBatches<T extends { needsAccount?: boolean }>(
  rows: T[],
  maxWeight = 10,
): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let weight = 0;

  for (const row of rows) {
    const cost = row.needsAccount ? 2 : 1;
    if (current.length > 0 && weight + cost > maxWeight) {
      batches.push(current);
      current = [];
      weight = 0;
    }
    current.push(row);
    weight += cost;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}
