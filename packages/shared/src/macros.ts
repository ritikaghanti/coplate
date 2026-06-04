import type { Macros } from "./schemas.js";

export const ZERO_MACROS: Macros = {
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
};

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    calories: a.calories + b.calories,
    protein_g: a.protein_g + b.protein_g,
    carbs_g: a.carbs_g + b.carbs_g,
    fat_g: a.fat_g + b.fat_g,
  };
}

export function subtractMacros(a: Macros, b: Macros): Macros {
  return {
    calories: a.calories - b.calories,
    protein_g: a.protein_g - b.protein_g,
    carbs_g: a.carbs_g - b.carbs_g,
    fat_g: a.fat_g - b.fat_g,
  };
}

export function sumMacros(list: Macros[]): Macros {
  return list.reduce(addMacros, ZERO_MACROS);
}

/** Round a macro block to whole numbers for display. */
export function roundMacros(m: Macros): Macros {
  return {
    calories: Math.round(m.calories),
    protein_g: Math.round(m.protein_g),
    carbs_g: Math.round(m.carbs_g),
    fat_g: Math.round(m.fat_g),
  };
}
