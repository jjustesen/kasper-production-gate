// Unit tests for the pure helpers: dates, products, claims, approvals.

import { describe, expect, it } from "vitest";
import { findApproval } from "../src/approvals.ts";
import { findBanned, maxDiscount } from "../src/claims.ts";
import { addBusinessDays, businessDaysBetween, parseDate } from "../src/dates.ts";
import { buildIndex, isBrandOnly, resolve } from "../src/products.ts";

const day = (s: string) => parseDate(s)!;
const TUE = day("2026-10-13");

describe("business days", () => {
  it("counts today as day zero", () => {
    expect(businessDaysBetween(TUE, TUE)).toBe(0);
    expect(businessDaysBetween(TUE, day("2026-10-14"))).toBe(1);
  });

  it("skips the weekend", () => {
    expect(businessDaysBetween(TUE, day("2026-10-20"))).toBe(5); // Wed Thu Fri Mon Tue
  });

  it("handles a due date on a weekend", () => {
    expect(businessDaysBetween(TUE, day("2026-10-18"))).toBe(3); // Sunday
  });

  it("returns 0 for a due date in the past", () => {
    expect(businessDaysBetween(TUE, day("2026-10-09"))).toBe(0);
  });

  it("adds business days across a weekend", () => {
    expect(addBusinessDays(TUE, 3)).toEqual(day("2026-10-16"));
    expect(addBusinessDays(TUE, 5)).toEqual(day("2026-10-20"));
    expect(addBusinessDays(day("2026-10-16"), 1)).toEqual(day("2026-10-19")); // Fri -> Mon
  });

  it("rejects malformed dates", () => {
    expect(parseDate("20/10/2026")).toBeNull();
    expect(parseDate("")).toBeNull();
    expect(parseDate(null)).toBeNull();
  });
});

describe("products", () => {
  const catalog = [
    { sku: "PT-JERKY-CHK", name: "Chicken Jerky", aliases: ["jerky", "chicken jerky"], active: true },
    { sku: "NP-TIN-HAZ", name: "Hazelnut Tin", aliases: ["hazelnut"], active: false },
  ];
  const index = buildIndex(catalog);

  it("matches SKU, name, alias and a leading article", () => {
    for (const text of ["PT-JERKY-CHK", "pt-jerky-chk", "Chicken Jerky", "jerky", "the chicken jerky", "  The  Chicken   Jerky "]) {
      expect(resolve(text, index)?.sku, text).toBe("PT-JERKY-CHK");
    }
  });

  it("returns null for an unknown product", () => {
    expect(resolve("turkey jerky", index)).toBeNull();
  });

  it("still resolves inactive products (the gate decides they're blocked)", () => {
    expect(resolve("Hazelnut Tin", index)?.active).toBe(false);
  });

  it("recognises brand-only work", () => {
    expect(isBrandOnly("Brand")).toBe(true);
    expect(isBrandOnly("brand kit")).toBe(false);
  });
});

describe("claims", () => {
  it("matches whole words only", () => {
    expect(findBanned("Feel secure all night", ["cure"])).toEqual([]);
    expect(findBanned("The cure for dry skin", ["cure"])).toEqual(["cure"]);
  });

  it("doesn't treat water-resistant as waterproof", () => {
    expect(findBanned("Water-resistant shell, tested in drizzle", ["waterproof"])).toEqual([]);
    expect(findBanned("Fully WATERPROOF shell", ["waterproof"])).toEqual(["waterproof"]);
  });

  it("catches a Portuguese banned word", () => {
    expect(findBanned("Mensagem: a cura para a pele seca.", ["cure", "cura"])).toEqual(["cura"]);
  });

  it("matches phrases with hyphens or extra spaces", () => {
    expect(findBanned("Before-and-after results", ["before and after"])).toEqual(["before and after"]);
    expect(findBanned("before   and after", ["before and after"])).toEqual(["before and after"]);
  });

  it("extracts discounts", () => {
    expect(maxDiscount("Early access: 50% off the Trail Pack.")).toBe(50);
    expect(maxDiscount("20% off first box, 25 % off after")).toBe(25);
    expect(maxDiscount("Save 15% today")).toBe(15);
    expect(maxDiscount("100% natural, no discount talk")).toBeNull();
    expect(maxDiscount("Keeps coffee hot for 12 hours.")).toBeNull();
  });
});

describe("approvals", () => {
  const now = new Date("2026-10-13T09:00:00Z");
  const comment = (by: string, text: string, at = "2026-10-12T16:10:00Z") => ({ by, at, text });

  it("accepts the Squad Lead's rush approval", () => {
    const { lead, others } = findApproval([comment("Louise", "Rush approved — Louise.")], "rush", "Louise", now);
    expect(lead).not.toBeNull();
    expect(others).toEqual([]);
  });

  it("ignores a designer's 'rush ok' but reports it", () => {
    const { lead, others } = findApproval([comment("Juliana", "rush ok, I can squeeze it in")], "rush", "Louise", now);
    expect(lead).toBeNull();
    expect(others.map((c) => c.by)).toEqual(["Juliana"]);
  });

  it("doesn't count a negated approval", () => {
    expect(findApproval([comment("Louise", "Rush not approved, move the date")], "rush", "Louise", now).lead).toBeNull();
  });

  it("ignores approvals written after the check time", () => {
    const late = comment("Louise", "Rush approved", "2026-10-13T10:00:00Z");
    expect(findApproval([late], "rush", "Louise", now).lead).toBeNull();
  });

  it("doesn't treat a rush approval as an overage approval", () => {
    expect(findApproval([comment("Bea A.", "Rush approved")], "overage", "Bea A.", now).lead).toBeNull();
  });
});
