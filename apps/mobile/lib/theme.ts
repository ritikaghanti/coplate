/**
 * Coplate design tokens.
 *
 * Aesthetic direction: "warm dark kitchen" — near-black charcoal base with a
 * single confident amber accent (think cast-iron + a flame), not the default
 * blue/purple SaaS gradient. One dominant color, one sharp accent, generous
 * spacing. The macro ring is the memorable element.
 */
export const theme = {
  color: {
    bg: "#15120E",
    surface: "#211C16",
    surfaceAlt: "#2C261D",
    border: "#3A332785",
    text: "#F4EFE6",
    textMuted: "#A89E8C",
    accent: "#F2933A", // amber/flame
    accentSoft: "#F2933A22",
    protein: "#E86A5C",
    carbs: "#E0B341",
    fat: "#5FA8A0",
    danger: "#E05C5C",
  },
  radius: { sm: 10, md: 16, lg: 24, pill: 999 },
  space: (n: number) => n * 4,
  font: {
    // Expo ships with the platform serif/system; on iOS this gives a refined
    // editorial feel without bundling custom fonts in the slice.
    display: "Georgia",
    body: "System",
  },
} as const;
