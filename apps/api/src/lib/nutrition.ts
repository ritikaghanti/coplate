import type { Macros } from "@coplate/shared";

/**
 * A minimal, hand-curated nutrition reference (per 100g unless noted).
 *
 * In Phase 2 this gets replaced by a real source (USDA FoodData Central)
 * embedded into pgvector for semantic lookup. For the slice, a lookup table
 * is enough to demonstrate *grounding*: we don't blindly trust the model's
 * numbers — we reconcile them against a known reference where we can match.
 */
export interface NutritionEntry {
  /** lowercase keywords that should match this entry */
  keywords: string[];
  per100g: Macros;
}

export const NUTRITION_DB: NutritionEntry[] = [
  { keywords: ["chicken breast", "grilled chicken", "chicken"], per100g: { calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 } },
  { keywords: ["white rice", "steamed rice", "rice"], per100g: { calories: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3 } },
  { keywords: ["brown rice"], per100g: { calories: 123, protein_g: 2.7, carbs_g: 25, fat_g: 1 } },
  { keywords: ["broccoli"], per100g: { calories: 34, protein_g: 2.8, carbs_g: 7, fat_g: 0.4 } },
  { keywords: ["salmon"], per100g: { calories: 208, protein_g: 20, carbs_g: 0, fat_g: 13 } },
  { keywords: ["egg", "eggs", "fried egg", "scrambled egg"], per100g: { calories: 155, protein_g: 13, carbs_g: 1.1, fat_g: 11 } },
  { keywords: ["avocado"], per100g: { calories: 160, protein_g: 2, carbs_g: 9, fat_g: 15 } },
  { keywords: ["almonds", "almond"], per100g: { calories: 579, protein_g: 21, carbs_g: 22, fat_g: 50 } },
  { keywords: ["banana"], per100g: { calories: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3 } },
  { keywords: ["pizza", "cheese pizza"], per100g: { calories: 266, protein_g: 11, carbs_g: 33, fat_g: 10 } },
  { keywords: ["pasta", "spaghetti"], per100g: { calories: 158, protein_g: 6, carbs_g: 31, fat_g: 0.9 } },
  { keywords: ["bread", "toast"], per100g: { calories: 265, protein_g: 9, carbs_g: 49, fat_g: 3.2 } },
  { keywords: ["sweet potato"], per100g: { calories: 86, protein_g: 1.6, carbs_g: 20, fat_g: 0.1 } },
  { keywords: ["greek yogurt", "yogurt"], per100g: { calories: 59, protein_g: 10, carbs_g: 3.6, fat_g: 0.4 } },
  { keywords: ["oats", "oatmeal", "porridge"], per100g: { calories: 389, protein_g: 17, carbs_g: 66, fat_g: 7 } },
];

/** Naive keyword match. Returns the first matching reference entry, if any. */
export function lookupNutrition(foodName: string): NutritionEntry | undefined {
  const name = foodName.toLowerCase();
  return NUTRITION_DB.find((e) => e.keywords.some((k) => name.includes(k)));
}
