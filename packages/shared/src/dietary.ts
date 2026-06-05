import { z } from "zod";

/**
 * Dietary profile — used everywhere the app *advises* food (Save Room guidance,
 * future menu suggestions). NOT used in photo logging, which only identifies
 * what's already on the plate.
 *
 * Allergies are a safety matter: advice that respects them must still tell the
 * user to verify ingredients themselves, because no model can guarantee a dish
 * is allergen-free. The API enforces this disclaimer.
 */
export const DIET_TYPES = [
  { id: "none", label: "No restriction" },
  { id: "vegetarian", label: "Vegetarian" },
  { id: "vegan", label: "Vegan" },
  { id: "pescatarian", label: "Pescatarian" },
] as const;

export const DietTypeSchema = z.enum(["none", "vegetarian", "vegan", "pescatarian"]);
export type DietType = z.infer<typeof DietTypeSchema>;

export const DietaryProfileSchema = z.object({
  dietType: DietTypeSchema.default("none"),
  allergies: z.string().max(500).default(""),
  dislikes: z.string().max(500).default(""),
});
export type DietaryProfile = z.infer<typeof DietaryProfileSchema>;

/** Used to update the profile; same shape, all fields required after parse. */
export const UpdateDietaryProfileSchema = DietaryProfileSchema;
export type UpdateDietaryProfile = z.infer<typeof UpdateDietaryProfileSchema>;

/** Build a short, prompt-ready description of constraints for the LLM. */
export function describeDietaryConstraints(p: DietaryProfile): string {
  const parts: string[] = [];
  if (p.dietType !== "none") parts.push(`Diet: ${p.dietType}.`);
  if (p.allergies.trim()) parts.push(`Allergies (MUST avoid): ${p.allergies.trim()}.`);
  if (p.dislikes.trim()) parts.push(`Dislikes (avoid if possible): ${p.dislikes.trim()}.`);
  return parts.length ? parts.join(" ") : "No dietary restrictions.";
}
