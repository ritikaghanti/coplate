import Anthropic from "@anthropic-ai/sdk";
import {
  estimateEventMacros,
  rebalanceForEvent,
  roundMacros,
  type Macros,
  type PizzaModePlan,
  type PizzaModePlanRequest,
} from "@coplate/shared";

const MODEL = "claude-sonnet-4-6";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Build a Pizza Mode plan: the numbers are computed deterministically, then we
 * ask the model for ONE short, friendly paragraph on how to structure the day.
 * If the model call fails for any reason, we fall back to a templated message
 * so the feature is never blocked on the LLM — the math is the product, the
 * guidance is the polish.
 */
export async function buildPizzaModePlan(
  req: PizzaModePlanRequest,
  dailyBudget: Macros
): Promise<PizzaModePlan> {
  const eventReserve = estimateEventMacros(req.eventCalories);
  const daytimeBudget = rebalanceForEvent(dailyBudget, eventReserve);

  const guidance = await generateGuidance(req, daytimeBudget).catch(() =>
    fallbackGuidance(req, daytimeBudget)
  );

  return {
    dailyBudget: roundMacros(dailyBudget),
    eventReserve: roundMacros(eventReserve),
    daytimeBudget: roundMacros(daytimeBudget),
    guidance,
    eventTime: req.eventTime,
    venueLabel: req.venueLabel,
  };
}

async function generateGuidance(req: PizzaModePlanRequest, daytime: Macros): Promise<string> {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 220,
    system:
      "You are a supportive nutrition co-pilot. Give ONE short, warm paragraph " +
      "(2-3 sentences, no lists, no markdown) telling the user how to structure " +
      "their breakfast and lunch to save room for tonight's event while staying " +
      "on track. Be specific about protein and fats. Never shame; keep it upbeat.",
    messages: [
      {
        role: "user",
        content:
          `Tonight: ${req.venueLabel} at ${req.eventTime}, reserving ~${req.eventCalories} cal.\n` +
          `Daytime budget left for breakfast + lunch: ${daytime.calories} cal, ` +
          `${daytime.protein_g}g protein, ${daytime.carbs_g}g carbs, ${daytime.fat_g}g fat.\n` +
          `Give the structuring advice.`,
      },
    ],
  });
  const text = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("").trim();
  return text || fallbackGuidance(req, daytime);
}

function fallbackGuidance(req: PizzaModePlanRequest, daytime: Macros): string {
  const perMeal = Math.round(daytime.calories / 2);
  return (
    `You've got ${daytime.calories} calories for the day before ${req.venueLabel}. ` +
    `Aim for roughly ${perMeal} at breakfast and ${perMeal} at lunch, leaning on lean ` +
    `protein and vegetables and keeping fats light — tonight will cover those. ` +
    `Enjoy the evening; it's already in the plan.`
  );
}
