import type { BarcodeProduct, Macros } from "@coplate/shared";

/**
 * Open Food Facts lookup.
 *
 * OFF is a free, open, community-maintained product database — no API key.
 * We hit the v2 product endpoint server-side (Node 20+ has global fetch) so
 * the mobile client keeps talking only to our own API. OFF data is crowd-
 * sourced and patchy, so the caller must handle ProductNotFound /
 * IncompleteNutrition gracefully.
 *
 * Nutriments come keyed per 100g (e.g. `energy-kcal_100g`, `proteins_100g`).
 * We normalize those into our canonical per-100g Macros block.
 */

const OFF_ENDPOINT = "https://world.openfoodfacts.org/api/v2/product";
// OFF asks API users to identify their app in the User-Agent.
const USER_AGENT = "Coplate/0.1 (portfolio project)";

export class ProductNotFoundError extends Error {}
export class IncompleteNutritionError extends Error {}

/** Coerce OFF's loosely-typed numeric fields to a finite number or undefined. */
function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** Clamp into the range our MacrosSchema accepts, so valid OFF data never trips Zod. */
function clamp(n: number, max: number): number {
  return Math.max(0, Math.min(n, max));
}

interface OffNutriments {
  ["energy-kcal_100g"]?: unknown;
  ["energy_100g"]?: unknown; // kJ fallback
  ["proteins_100g"]?: unknown;
  ["carbohydrates_100g"]?: unknown;
  ["fat_100g"]?: unknown;
}

function toMacros(n: OffNutriments): Macros | null {
  let calories = num(n["energy-kcal_100g"]);
  // Some products only carry energy in kJ — convert (1 kcal = 4.184 kJ).
  if (calories === undefined) {
    const kj = num(n["energy_100g"]);
    if (kj !== undefined) calories = kj / 4.184;
  }
  const protein_g = num(n["proteins_100g"]);
  const carbs_g = num(n["carbohydrates_100g"]);
  const fat_g = num(n["fat_100g"]);

  // Require at least calories plus one macro to consider this usable.
  const present = [calories, protein_g, carbs_g, fat_g].filter((x) => x !== undefined).length;
  if (calories === undefined || present < 2) return null;

  return {
    calories: clamp(calories, 5000),
    protein_g: clamp(protein_g ?? 0, 500),
    carbs_g: clamp(carbs_g ?? 0, 500),
    fat_g: clamp(fat_g ?? 0, 500),
  };
}

/**
 * Look up a product by barcode. Throws ProductNotFoundError if OFF has no
 * record, IncompleteNutritionError if the record lacks usable macros.
 */
export async function lookupBarcode(barcode: string): Promise<BarcodeProduct> {
  const url = `${OFF_ENDPOINT}/${encodeURIComponent(barcode)}.json` +
    `?fields=product_name,brands,serving_size,nutriments`;

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    // OFF returns 404 for unknown products; treat any non-2xx defensively.
    if (res.status === 404) throw new ProductNotFoundError(barcode);
    throw new Error(`Open Food Facts returned ${res.status}`);
  }

  const data = (await res.json()) as {
    status?: number;
    product?: { product_name?: string; brands?: string; serving_size?: string; nutriments?: OffNutriments };
  };

  // OFF uses status 0 = not found, 1 = found.
  if (data.status !== 1 || !data.product) {
    throw new ProductNotFoundError(barcode);
  }

  const p = data.product;
  const per100g = toMacros(p.nutriments ?? {});
  if (!per100g) throw new IncompleteNutritionError(barcode);

  const name = (p.product_name ?? "").trim() || "Unknown product";
  const brand = (p.brands ?? "").split(",")[0]?.trim() || undefined;
  const serving_size = (p.serving_size ?? "").trim() || undefined;

  return { barcode, name, brand, per100g, serving_size };
}
