import Anthropic from "@anthropic-ai/sdk";
import {
  estimateEventMacros,
  rebalanceForEvent,
  roundMacros,
  describeDietaryConstraints,
  type Macros,
  type DietaryProfile,
  type PizzaModePlan,
  type PizzaModePlanRequest,
} from "@coplate/shared";

const MODEL = "claude-sonnet-4-6";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ALLERGY_DISCLAIMER =
  " Always double-check ingredients yourself — this is guidance, not a guarantee.";

/**
 * Build a Save Room plan: the numbers are computed deterministically, then we
 * ask the model for ONE short, friendly paragraph on how to structure the day,
 * respecting the user's dietary profile. If the model call fails for any
 * reason, we fall back to a templated message so the feature is never blocked
 * on the LLM — the math is the product, the guidance is the polish.
 */
export async function buildSaveRoomPlan(
  req: PizzaModePlanRequest,
  dailyBudget: Macros,
  profile: DietaryProfile
): Promise<PizzaModePlan> {
  const eventReserve = estimateEventMacros(req.eventCalories);
  const daytimeBudget = rebalanceForEvent(dailyBudget, eventReserve);

  const guidance = await generateGuidance(req, daytimeBudget, profile).catch(() =>
    fallbackGuidance(req, daytimeBudget, profile)
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

async function generateGuidance(
  req: PizzaModePlanRequest,
  daytime: Macros,
  profile: DietaryProfile
): Promise<string> {
  const constraints = describeDietaryConstraints(profile);
  const hasAllergies = profile.allergies.trim().length > 0;

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 240,
    system:
      "You are a supportive nutrition co-pilot. Give ONE short, warm paragraph " +
      "(2-3 sentences, no lists, no markdown) telling the user how to structure " +
      "their breakfast and lunch to save room for tonight's event while staying " +
      "on track. Be specific about protein and fats. STRICTLY respect the user's " +
      "dietary constraints — never suggest foods that violate their diet or " +
      "allergies. Never present any suggestion as guaranteed allergen-free. " +
      "Never shame; keep it upbeat.",
    messages: [
      {
        role: "user",
        content:
          `Tonight: ${req.venueLabel} at ${req.eventTime}, reserving ~${req.eventCalories} cal.\n` +
          `Daytime budget left for breakfast + lunch: ${daytime.calories} cal, ` +
          `${daytime.protein_g}g protein, ${daytime.carbs_g}g carbs, ${daytime.fat_g}g fat.\n` +
          `User's dietary constraints: ${constraints}\n` +
          `Give the structuring advice.`,
      },
    ],
  });
  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim();
  if (!text) return fallbackGuidance(req, daytime, profile);
  // Append the safety note whenever allergies are on file.
  return hasAllergies ? text + ALLERGY_DISCLAIMER : text;
}

function fallbackGuidance(
  req: PizzaModePlanRequest,
  daytime: Macros,
  profile: DietaryProfile
): string {
  const perMeal = Math.round(daytime.calories / 2);
  const dietNote =
    profile.dietType !== "none" ? ` Keep it ${profile.dietType}-friendly.` : "";
  const allergyNote = profile.allergies.trim() ? ALLERGY_DISCLAIMER : "";
  return (
    `You've got ${daytime.calories} calories for the day before ${req.venueLabel}. ` +
    `Aim for roughly ${perMeal} at breakfast and ${perMeal} at lunch, leaning on lean ` +
    `protein and vegetables and keeping fats light — tonight will cover those.${dietNote} ` +
    `Enjoy the evening; it's already in the plan.${allergyNote}`
  );
}
