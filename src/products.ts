// Resolve the product names people type in briefs to catalog entries.

import type { CatalogItem } from "./models.ts";

const BRAND_ONLY = "brand";
const LEADING_ARTICLE = /^(the|a|an|our)\s+/;

export function normalise(text: string): string {
  return text.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ").replace(LEADING_ARTICLE, "");
}

/** Map every SKU, name and alias of one client's catalog to its entry. */
export function buildIndex(catalog: CatalogItem[]): Map<string, CatalogItem> {
  const index = new Map<string, CatalogItem>();
  for (const item of catalog) {
    for (const key of [item.sku, item.name, ...(item.aliases ?? [])]) {
      index.set(normalise(key), item);
    }
  }
  return index;
}

/**
 * The catalog entry, or null if unknown. Matching is per client on purpose:
 * "kit" means the Starter Kit at Lumen and the Sleep Kit at Halo.
 */
export function resolve(product: string, index: Map<string, CatalogItem>): CatalogItem | null {
  return index.get(normalise(product)) ?? null;
}

export function isBrandOnly(product: string): boolean {
  return normalise(product) === BRAND_ONLY;
}
