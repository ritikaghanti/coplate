import { z } from "zod";
import { MacrosSchema, type Macros } from "./schemas.js";

/**
 * Pizza Mode — the proactive differentiator.
 *
 * Other trackers are reactive: you eat, then they show a red bar. Pizza Mode
 * works backward from a planned high-calorie event: you reserve calories for
 * tonight, and it reshapes the daytime budget *before* you eat so you arrive
 * at the event already on-plan.
 *
 * The budget math here is fully deterministic (no LLM) so it's reliable and
 * testable. The only AI touch lives in the API layer: a short natural-language
 * "how to structure your day" suggestion built on top of these numbers.
 */

/** Preset venues give a one-tap calorie estimate; the user can override it. */
export const VENUE_PRESETS = [
  { id: "pizza", label: "Pizza place", calories: 900 },
  { id: "sushi", label: "Sushi", calories: 700 },
  { id: "burger", label: "Burger & fries", calories: 1100 },
  { id: "italian", label: "Italian / pasta", calories: 1000 },
  { id: "mexican", label: "Mexican", calories: 950 },
  { id: "steakhouse", label: "Steakhouse", calories: 1200 },
  { id: "drinks", label: "Drinks / bar", calories: 600 },
  { id: "custom", label: "Something else", calories: 800 },
] as const;

export const PizzaModePlanRequestSchema = z.object({
  venueLabel: z.string().min(1).max(80),
  eventCalories: z.number().min(100).max(3000),
  eventTime: z.string().min(1).max(20).describe('e.g. "8:00 PM"'),
});
export type PizzaModePlanRequest = z.infer<typeof PizzaModePlanRequestSchema>;

/** The result the UI renders: the reshaped numbers + a coaching message. */
export const PizzaModePlanSchema = z.object({
  dailyBudget: MacrosSchema,
  eventReserve: MacrosSchema.describe("Soft-locked block for the event"),
  daytimeBudget: MacrosSchema.describe("What's left for breakfast + lunch"),
  guidance: z.string().describe("Short natural-language structuring advice"),
  eventTime: z.string(),
  venueLabel: z.string(),
});
export type PizzaModePlan = z.infer<typeof PizzaModePlanSchema>;

/**
 * Estimate a macro split for the event from its calorie figure. Restaurant
 * meals skew carb/fat-heavy, so we use a 20/45/35 protein/carb/fat split
 * (by calories) rather than the user's clean daily ratios. 4/4/9 kcal per
 * gram for protein/carb/fat.
 */
export function estimateEventMacros(eventCalories: number): Macros {
  const proteinCals = eventCalories * 0.2;
  const carbCals = eventCalories * 0.45;
  const fatCals = eventCalories * 0.35;
  return {
    calories: eventCalories,
    protein_g: proteinCals / 4,
    carbs_g: carbCals / 4,
    fat_g: fatCals / 9,
  };
}

/**
 * The core rebalance: subtract the event reserve from the daily budget to get
 * the daytime budget. Clamp at zero so a huge event never produces negative
 * targets (instead it just means "eat very little before").
 */
export function rebalanceForEvent(dailyBudget: Macros, eventReserve: Macros): Macros {
  const clamp = (n: number) => Math.max(0, n);
  return {
    calories: clamp(dailyBudget.calories - eventReserve.calories),
    protein_g: clamp(dailyBudget.protein_g - eventReserve.protein_g),
    carbs_g: clamp(dailyBudget.carbs_g - eventReserve.carbs_g),
    fat_g: clamp(dailyBudget.fat_g - eventReserve.fat_g),
  };
}
