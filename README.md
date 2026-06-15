# Coplate 🍽️

**A fitness co-pilot that kills the friction of food tracking.** Snap a photo of
your plate and Coplate identifies the food and logs your macros no manual
searching, no calorie "math homework." And instead of guilt-tripping you after
you overeat, it plans *ahead*: tell it you're going out for pizza tonight and it
reshapes your whole day's budget so you arrive on-plan.

Built as a TypeScript monorepo: an Expo (React Native) iOS app, a Fastify API,
and a shared package whose Zod schemas are the single source of truth across the
client, the server, and the LLM's output.

---

## Features

- **Snap-and-Log (vision):** Photograph a meal, or pick one from your gallery 
  and a multimodal LLM pipeline identifies items, estimates portions, and
  returns calories/protein/carbs/fat as validated structured data, reconciled
  against a nutrition reference.
- **Editable results (human-in-the-loop):** The model proposes; you dispose.
  Every detected item is editable. You have the ability to correct its macros, rename it, set the grams
  you actually ate (which rescales the macros), remove a misfire, or add
  something it missed. The logged total recomputes live, so what's saved is
  always what you confirmed.
- **Barcode scanning:** Point the camera at a packaged product and Coplate
  resolves it against Open Food Facts for instant macros. Because that data is
  community-sourced and imperfect, the values are pre-filled but fully editable,
  and a calorie/macro reconciliation check (Atwater) quietly flags entries that
  don't add up, so bad data never gets logged silently.
- **Save Room (the differentiator):** Reserve calories for a planned event. The
  app subtracts them from your daily budget *up front* and coaches you on how to
  structure your remaining meals adapting its advice to whether the event is
  morning, midday, or evening. Logged event meals draw from the reserved block,
  not your daytime budget.
- **Dietary profile:** Diet type, allergies, and dislikes that flow into every
  place the app advises food. Allergy-aware guidance always reminds you to
  verify ingredients — it steers, it never guarantees.
- **Meal management:** Swipe a logged meal to delete it; totals and budget
  update immediately.
- **Accounts:** Email/password auth with bcrypt-hashed passwords and JWTs; all
  data is scoped per user.

---

## Architecture

```
coplate/                 pnpm workspace monorepo
├── packages/shared      Zod schemas + domain logic — the single source of truth
│                        (validates the API boundary, types the app, AND
│                         validates raw LLM JSON: define once, trust everywhere)
├── apps/api             Fastify + Drizzle ORM + Postgres (Neon)
│   └── src/lib/
│       ├── vision.ts          Vision pipeline: structured output + retry + grounding
│       ├── openFoodFacts.ts   Barcode → Open Food Facts lookup + macro normalization
│       ├── saveRoom.ts        Deterministic budget math + time-aware LLM guidance
│       └── auth.ts            bcrypt hashing + JWT sign/verify
└── apps/mobile          Expo / React Native (iOS), Expo Router
    └── lib/AuthContext  Token stored in the device keychain (SecureStore)
```

**Design idea worth calling out:** the macro/food/plan shapes are defined once as
Zod schemas in `packages/shared`. The API validates requests with them, the
mobile app imports them as types, and the vision pipeline parses the LLM's raw
JSON through the *same* schemas with a retry loop that re-prompts the model
when validation fails. One contract, enforced everywhere. The barcode path reuses
those same schemas, so a scanned product flows through the exact validation and
logging route as a snapped plate.

---

## Tech stack

| Layer        | Choice                                                        |
|--------------|---------------------------------------------------------------|
| Language     | TypeScript end-to-end                                         |
| Mobile       | Expo (React Native), Expo Router, Gesture Handler             |
| API          | Fastify, Zod                                                  |
| Database     | Postgres (Neon, serverless) via Drizzle ORM                   |
| AI           | Anthropic Claude (multimodal vision + structured output)      |
| Data         | Open Food Facts (barcode product lookup)                      |
| Auth         | bcryptjs, JSON Web Tokens, Expo SecureStore                   |
| Tooling      | pnpm workspaces                                               |

---

## Running locally

**Prerequisites:** Node 20+, pnpm, a Postgres database (Neon's free tier works),
an Anthropic API key, and Expo Go on you phone (on the same Wi-Fi as your
machine).

```bash
pnpm install
```

**API** — create `apps/api/.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=postgres://...           # Neon connection string
JWT_SECRET=...                        # e.g. `openssl rand -base64 32`
```

Create the database tables (schema lives in `apps/api/src/db/schema.ts`), then
start the API:

```bash
pnpm dev:api        # listens on 0.0.0.0:3000
```

**Mobile** — point the app at your machine's LAN IP by creating
`apps/mobile/.env`:

```
EXPO_PUBLIC_API_BASE=http://<your-LAN-IP>:3000
```

```bash
pnpm dev:mobile     # scan the QR code with the iPhone camera (opens in Expo Go)
```

Sign up, then snap a plate, scan a barcode, or set up a Save Room reservation.

---


#### Made by: Ritika Ghanti