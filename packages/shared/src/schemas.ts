import { z } from "zod";

/**
 * The macronutrient block. Every quantity is in grams except calories (kcal).
 * This is the atomic unit the whole app revolves around.
 */
export const MacrosSchema = z.object({
  calories: z.number().min(0).max(5000),
  protein_g: z.number().min(0).max(500),
  carbs_g: z.number().min(0).max(500),
  fat_g: z.number().min(0).max(500),
});
export type Macros = z.infer<typeof MacrosSchema>;

/**
 * A single food item the vision model claims to have identified on the plate.
 *
 * `confidence` and `portion_estimate` exist because vision models are
 * confidently wrong — capturing the model's own uncertainty lets us surface
 * "tap to adjust" UI and lets the eval harness analyze where errors come from.
 */
export const FoodItemSchema = z.object({
  name: z.string().min(1).max(120),
  portion_estimate: z
    .string()
    .min(1)
    .max(120)
    .describe('Human-readable portion, e.g. "approx 150g" or "1 medium bowl"'),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Model self-reported confidence this item is present and sized correctly"),
  macros: MacrosSchema,
});
export type FoodItem = z.infer<typeof FoodItemSchema>;

/**
 * The full structured output we REQUIRE the vision model to return.
 * The API validates raw model JSON against this; failures trigger a retry.
 */
export const VisionAnalysisSchema = z.object({
  items: z.array(FoodItemSchema).min(0).max(20),
  total: MacrosSchema.describe("Sum across all items — model computes, we verify"),
  notes: z
    .string()
    .max(500)
    .optional()
    .describe("Any caveats, e.g. hidden ingredients or ambiguous portions"),
});
export type VisionAnalysis = z.infer<typeof VisionAnalysisSchema>;

/** Request to analyze a plate photo. Image travels as base64 (data URL stripped). */
export const AnalyzePlateRequestSchema = z.object({
  image_base64: z.string().min(1),
  media_type: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
});
export type AnalyzePlateRequest = z.infer<typeof AnalyzePlateRequestSchema>;

/** What the analyze endpoint returns: the analysis plus observability metadata. */
export const AnalyzePlateResponseSchema = z.object({
  analysis: VisionAnalysisSchema,
  meta: z.object({
    model: z.string(),
    latency_ms: z.number(),
    input_tokens: z.number().optional(),
    output_tokens: z.number().optional(),
    estimated_cost_usd: z.number().optional(),
    grounded: z
      .boolean()
      .describe("Whether macros were reconciled against the nutrition DB"),
    retries: z.number().describe("How many times we re-prompted to get valid JSON"),
  }),
});
export type AnalyzePlateResponse = z.infer<typeof AnalyzePlateResponseSchema>;

/** A confirmed, logged meal stored in the DB. */
export const LoggedMealSchema = z.object({
  id: z.string().uuid(),
  logged_at: z.string().datetime(),
  items: z.array(FoodItemSchema),
  total: MacrosSchema,
  is_event_meal: z.boolean().default(false),
});
export type LoggedMeal = z.infer<typeof LoggedMealSchema>;

export const CreateMealRequestSchema = z.object({
  items: z.array(FoodItemSchema).min(1),
  total: MacrosSchema,
  is_event_meal: z.boolean().default(false),
});
export type CreateMealRequest = z.infer<typeof CreateMealRequestSchema>;

/** An active Save Room reservation for a given day. */
export const ReservationSchema = z.object({
  id: z.string().uuid(),
  venueLabel: z.string(),
  eventTime: z.string(),
  reserve: MacrosSchema,
});
export type Reservation = z.infer<typeof ReservationSchema>;

/**
 * Daily rollup the home screen shows.
 *
 * When a reservation exists, `daytimeBudget` = budget − reserve, and the
 * home screen tracks daytime consumption against that reduced number. Event
 * meals (the pizza) count against `eventConsumed`, not the daytime budget.
 */
export const DailySummarySchema = z.object({
  date: z.string(),
  budget: MacrosSchema,
  consumed: MacrosSchema.describe("All meals, event + non-event"),
  remaining: MacrosSchema.describe("budget − consumed (overall)"),
  reservation: ReservationSchema.nullable(),
  daytimeBudget: MacrosSchema.describe("budget − reserve (what's left for the day before the event)"),
  daytimeConsumed: MacrosSchema.describe("Non-event meals only"),
  daytimeRemaining: MacrosSchema.describe("daytimeBudget − daytimeConsumed"),
  eventConsumed: MacrosSchema.describe("Event meals only, counts against the reserve"),
  meals: z.array(LoggedMealSchema),
});
export type DailySummary = z.infer<typeof DailySummarySchema>;

/* ─────────────────────────── Barcode lookup ─────────────────────────── */

/**
 * Request to look up a product by its scanned barcode (EAN-13/EAN-8/UPC-A).
 * The API resolves this against Open Food Facts server-side, keeping the
 * "client only talks to our API" boundary intact.
 */
export const BarcodeLookupRequestSchema = z.object({
  barcode: z.string().min(6).max(20).regex(/^\d+$/, "Barcode must be digits only"),
});
export type BarcodeLookupRequest = z.infer<typeof BarcodeLookupRequestSchema>;

/**
 * A product resolved from Open Food Facts. Macros are PER 100g — the serving
 * the user actually ate is adjusted in the review UI (we default to 100g and
 * let them tweak), so we always carry the canonical per-100g figures here.
 */
export const BarcodeProductSchema = z.object({
  barcode: z.string(),
  name: z.string().min(1).max(200),
  brand: z.string().max(200).optional(),
  /** Macros for 100g of the product, as reported by Open Food Facts. */
  per100g: MacrosSchema,
  /** OFF's stated serving size string, if any (e.g. "30 g"), purely informational. */
  serving_size: z.string().max(60).optional(),
});
export type BarcodeProduct = z.infer<typeof BarcodeProductSchema>;

/** What the barcode endpoint returns: the product plus observability metadata. */
export const BarcodeLookupResponseSchema = z.object({
  product: BarcodeProductSchema,
  meta: z.object({
    source: z.literal("openfoodfacts"),
    latency_ms: z.number(),
  }),
});
export type BarcodeLookupResponse = z.infer<typeof BarcodeLookupResponseSchema>;
