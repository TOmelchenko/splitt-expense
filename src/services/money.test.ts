import { describe, expect, it } from "vitest";
import { formatSigned, parseAmountToCents, splitEqually } from "./money";
import { ServiceError } from "./types";

describe("splitEqually (largest remainder, in cents)", () => {
  it("splits €60 among 3 members into exactly €20 each", () => {
    expect(splitEqually(6000, 3)).toEqual([2000, 2000, 2000]);
  });

  it("gives the leftover cent to the first participant in list order", () => {
    expect(splitEqually(1000, 3)).toEqual([334, 333, 333]);
  });

  it("always sums back to the original total", () => {
    for (const total of [1, 7, 999, 12345, 100000]) {
      for (const members of [1, 2, 3, 4, 7, 10]) {
        const shares = splitEqually(total, members);
        expect(shares).toHaveLength(members);
        expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });
});

describe("parseAmountToCents", () => {
  it("accepts plain and 2-decimal amounts", () => {
    expect(parseAmountToCents("25.50")).toBe(2550);
    expect(parseAmountToCents("25")).toBe(2500);
    expect(parseAmountToCents(" 25,5 ")).toBe(2550);
  });

  it("rejects zero, negatives and >2 decimals", () => {
    for (const bad of ["0", "0.00", "-5", "25.505", "abc", ""]) {
      expect(() => parseAmountToCents(bad)).toThrow(ServiceError);
    }
  });
});

describe("formatSigned", () => {
  it("marks who receives and who owes", () => {
    expect(formatSigned(3000)).toContain("+");
    expect(formatSigned(-1000)).toContain("−");
    expect(formatSigned(0)).toContain("±");
  });
});
