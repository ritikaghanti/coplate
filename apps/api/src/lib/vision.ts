import Anthropic from "@anthropic-ai/sdk";
import {
  VisionAnalysisSchema,
  type VisionAnalysis,
  type AnalyzePlateResponse,
  type Macros,
} from "@coplate/shared";
import { lookupNutrition } from "./nutrition.js";

const MODEL = "claude-sonnet-4-6";
const MAX_RETRIES = 2;

// Sonnet pricing (USD per token). Update as pricing changes.
const COST_PER_INPUT_TOKEN = 3 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 15 / 1_000_000;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * The system prompt does the heavy lifting on output discipline. We describe
 * the EXACT JSON shape and forbid prose. Pairing this with Zod validation +
 * retry is the reliability pattern: the prompt makes valid output likely,
 * the validator guarantees we never pass malformed data downstream.
 */
const SYSTEM_PROMPT = `You are a nutrition vision analyst. You receive a photo of a plate of food.

Identify each distinct food item, estimate its portion size, and estimate macros.
Be realistic about portions from visual cues (plate size, utensils for scale).

Respond with ONLY a JSON object — no markdown, no backticks, no prose — matching:
{
  "items": [
    {
      "name": string,
      "portion_estimate": string,
      "confidence": number between 0 and 1,
      "macros": { "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number }
    }
  ],
  "total": { "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number },
  "notes": string (optional)
}

The "total" MUST equal the sum of item macros. If you cannot identify any food,
return an empty items array and zeroed totals. Never invent items you cannot see.`;

interface RawResult {
  analysis: VisionAnalysis;
  retries: number;
  usage: { input_tokens: number; output_tokens: number };
}

/** Strip markdown fences a model might add despite instructions. */
function cleanJson(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
}

/**
 * Call the model and force valid structured output. On a validation failure
 * we re-prompt with the parser's error message appended — letting the model
 * self-correct. This loop is the difference between "demo that breaks on the
 * 5th photo" and "production pipeline".
 */
async function analyzeWithRetry(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp"
): Promise<RawResult> {
  let lastError = "";
  let totalIn = 0;
  let totalOut = 0;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const userText =
      attempt === 0
        ? "Analyze this plate and return the JSON."
        : `Your previous response failed validation: ${lastError}. Return corrected JSON only.`;

    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text: userText },
          ],
        },
      ],
    });

    totalIn += msg.usage.input_tokens;
    totalOut += msg.usage.output_tokens;

    const text = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");

    try {
      const parsed = JSON.parse(cleanJson(text));
      const analysis = VisionAnalysisSchema.parse(parsed);
      return { analysis, retries: attempt, usage: { input_tokens: totalIn, output_tokens: totalOut } };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(`Vision model failed to produce valid output after ${MAX_RETRIES + 1} attempts: ${lastError}`);
}

/**
 * Grounding: where the model named a food we recognize, nudge its macro
 * estimate toward our reference values. We parse an approximate gram weight
 * out of the portion string and recompute from the per-100g reference,
 * blending 50/50 with the model so we correct gross errors without throwing
 * away the model's portion judgment. Honest about being a heuristic — Phase 2
 * replaces this with embedding-based retrieval over USDA data.
 */
function groundAnalysis(analysis: VisionAnalysis): { analysis: VisionAnalysis; grounded: boolean } {
  let groundedAny = false;

  const items = analysis.items.map((item) => {
    const ref = lookupNutrition(item.name);
    if (!ref) return item;

    const grams = parseGrams(item.portion_estimate);
    if (grams === null) return item;

    groundedAny = true;
    const factor = grams / 100;
    const referenceMacros: Macros = {
      calories: ref.per100g.calories * factor,
      protein_g: ref.per100g.protein_g * factor,
      carbs_g: ref.per100g.carbs_g * factor,
      fat_g: ref.per100g.fat_g * factor,
    };
    return { ...item, macros: blend(item.macros, referenceMacros) };
  });

  const total = items.reduce<Macros>(
    (acc, i) => ({
      calories: acc.calories + i.macros.calories,
      protein_g: acc.protein_g + i.macros.protein_g,
      carbs_g: acc.carbs_g + i.macros.carbs_g,
      fat_g: acc.fat_g + i.macros.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );

  return { analysis: { ...analysis, items, total }, grounded: groundedAny };
}

function blend(model: Macros, reference: Macros, w = 0.5): Macros {
  return {
    calories: model.calories * (1 - w) + reference.calories * w,
    protein_g: model.protein_g * (1 - w) + reference.protein_g * w,
    carbs_g: model.carbs_g * (1 - w) + reference.carbs_g * w,
    fat_g: model.fat_g * (1 - w) + reference.fat_g * w,
  };
}

/** Pull a gram estimate out of strings like "approx 150g" or "about 1 cup (200 g)". */
function parseGrams(portion: string): number | null {
  const match = portion.match(/(\d+(?:\.\d+)?)\s*g/i);
  return match ? parseFloat(match[1]) : null;
}

/** Public entry point used by the route and the eval harness. */
export async function analyzePlate(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg"
): Promise<AnalyzePlateResponse> {
  const start = Date.now();
  const raw = await analyzeWithRetry(imageBase64, mediaType);
  const { analysis, grounded } = groundAnalysis(raw.analysis);
  const latency = Date.now() - start;

  return {
    analysis,
    meta: {
      model: MODEL,
      latency_ms: latency,
      input_tokens: raw.usage.input_tokens,
      output_tokens: raw.usage.output_tokens,
      estimated_cost_usd:
        raw.usage.input_tokens * COST_PER_INPUT_TOKEN +
        raw.usage.output_tokens * COST_PER_OUTPUT_TOKEN,
      grounded,
      retries: raw.retries,
    },
  };
}
