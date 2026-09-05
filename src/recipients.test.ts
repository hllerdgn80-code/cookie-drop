import { describe, it, expect } from "vitest";
import {
  parseRecipients,
  toBaseUnits,
  fromBaseUnits,
  totalBaseUnits,
  planBatches,
  isValidAddress,
} from "./recipients";

// A real Cookie Chain / Solana address and a deliberately broken one.
const A = "9wDaBRDgArEUpvhHxGguNkwozsZh4UpGZB9o2EoEcBB2";
const B = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const BAD = "not-an-address";

describe("isValidAddress", () => {
  it("accepts canonical base58 addresses", () => {
    expect(isValidAddress(A)).toBe(true);
    expect(isValidAddress(B)).toBe(true);
  });

  it("rejects malformed input", () => {
    expect(isValidAddress(BAD)).toBe(false);
    expect(isValidAddress("")).toBe(false);
    // Right alphabet, wrong length — the case a regex-only check lets through.
    expect(isValidAddress("9wDaBRDgArEU")).toBe(false);
  });
});

describe("toBaseUnits", () => {
  it("converts without floating point drift", () => {
    // 0.1 * 1e9 in float is 100000000.00000001; string maths must not be.
    expect(toBaseUnits("0.1", 9)).toBe(100_000_000n);
    expect(toBaseUnits("1", 9)).toBe(1_000_000_000n);
    expect(toBaseUnits("1.000000001", 9)).toBe(1_000_000_001n);
  });

  it("keeps large amounts exact", () => {
    expect(toBaseUnits("123456789.123456789", 9)).toBe(123456789123456789n);
  });

  it("rejects more precision than the token has", () => {
    expect(() => toBaseUnits("1.0000000001", 9)).toThrow(/decimal places/);
    expect(() => toBaseUnits("0.001", 2)).toThrow(/decimal places/);
  });

  it("rejects non-numeric and negative input", () => {
    expect(() => toBaseUnits("-1", 9)).toThrow();
    expect(() => toBaseUnits("1e9", 9)).toThrow();
    expect(() => toBaseUnits("", 9)).toThrow();
  });
});

describe("fromBaseUnits", () => {
  it("round-trips with toBaseUnits", () => {
    for (const amount of ["1", "0.1", "1.5", "123456789.123456789"]) {
      expect(fromBaseUnits(toBaseUnits(amount, 9), 9)).toBe(amount);
    }
  });

  it("trims trailing zeros but keeps whole numbers", () => {
    expect(fromBaseUnits(1_000_000_000n, 9)).toBe("1");
    expect(fromBaseUnits(1_500_000_000n, 9)).toBe("1.5");
    expect(fromBaseUnits(0n, 9)).toBe("0");
  });
});

describe("parseRecipients", () => {
  it("accepts comma, space and tab separators", () => {
    const { rows, issues } = parseRecipients(`${A},1\n${B} 2\n${A}\t3`);
    expect(issues).toEqual([]);
    expect(rows.map((r) => r.amount)).toEqual(["1", "2", "3"]);
  });

  it("skips blanks, comments and a CSV header", () => {
    const { rows, issues } = parseRecipients(
      `address,amount\n\n# a comment\n${A},1\n`,
    );
    expect(rows).toHaveLength(1);
    expect(issues).toEqual([]);
  });

  it("reports every bad line instead of dropping it", () => {
    const { rows, issues } = parseRecipients(`${BAD},1\n${A},abc\n${A},0\n${A},1`);
    expect(rows).toHaveLength(1);
    expect(issues).toHaveLength(3);
    expect(issues[0].reason).toMatch(/not a valid address/);
    expect(issues[1].reason).toMatch(/not a positive number/);
    expect(issues[2].reason).toMatch(/zero/);
    // Line numbers must point at the original input, not the filtered list.
    expect(issues.map((i) => i.line)).toEqual([1, 2, 3]);
  });

  it("flags duplicates with the lines they came from", () => {
    const { duplicates } = parseRecipients(`${A},1\n${B},2\n${A},3`);
    expect(duplicates.get(A)).toEqual([1, 3]);
    expect(duplicates.has(B)).toBe(false);
  });

  it("keeps a row whose amount is missing out of the totals", () => {
    const { rows, issues } = parseRecipients(`${A}\n${A},1`);
    expect(rows).toHaveLength(1);
    // A lone valid address is a missing amount, not a malformed line.
    expect(issues[0].reason).toMatch(/missing amount/);
  });

  it("distinguishes a malformed line from a missing amount", () => {
    const { issues } = parseRecipients(`${BAD}`);
    expect(issues[0].reason).toMatch(/expected an address and an amount/);
  });
});

describe("totalBaseUnits", () => {
  it("sums exactly across many rows", () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({
      line: i + 1,
      address: A,
      amount: "0.1",
    }));
    // 1000 × 0.1 = 100 exactly; float accumulation would not be.
    expect(totalBaseUnits(rows, 9)).toBe(100_000_000_000n);
  });
});

describe("planBatches", () => {
  it("fills batches up to the weight limit", () => {
    const rows = Array.from({ length: 25 }, () => ({ needsAccount: false }));
    const batches = planBatches(rows, 10);
    expect(batches.map((b) => b.length)).toEqual([10, 10, 5]);
  });

  it("counts recipients needing a token account double", () => {
    const rows = Array.from({ length: 10 }, () => ({ needsAccount: true }));
    const batches = planBatches(rows, 10);
    // Two instructions each, so five per transaction.
    expect(batches.map((b) => b.length)).toEqual([5, 5]);
  });

  it("never drops or duplicates a row", () => {
    const rows = Array.from({ length: 37 }, (_, i) => ({
      needsAccount: i % 3 === 0,
      id: i,
    }));
    const flat = planBatches(rows, 10).flat();
    expect(flat).toHaveLength(37);
    expect(new Set(flat.map((r) => r.id)).size).toBe(37);
  });

  it("returns nothing for an empty list", () => {
    expect(planBatches([], 10)).toEqual([]);
  });

  it("still emits a batch for a row heavier than the limit", () => {
    const batches = planBatches([{ needsAccount: true }], 1);
    expect(batches).toEqual([[{ needsAccount: true }]]);
  });
});
