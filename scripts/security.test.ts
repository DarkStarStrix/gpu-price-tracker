import { describe, it, expect } from "vitest";
import { toCSV } from "../shared/csv";
describe("CSV export", () => {
  it("neutralizes formulas even after whitespace and control prefixes", () => {
    for (const value of [
      "=1+1",
      "+1+1",
      "-1+1",
      "@SUM(1)",
      " \t=1+1",
      "\r=1+1",
      "\n=1+1",
      "\tdata",
      "\u0000=1+1",
    ]) {
      expect(toCSV([[value]])).toBe(`"'${value}"`);
    }
  });
  it("preserves ordinary prices and quotes embedded delimiters and newlines", () => {
    expect(toCSV([["H100", 2.25, null], ['a,"b"\nc']])).toBe(
      '"H100","2.25",""\r\n"a,""b""\nc"'
    );
  });
});
